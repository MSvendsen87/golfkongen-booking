BEGIN;
CREATE TABLE IF NOT EXISTS gk2_private.punchcard_purchases (
 order_id text PRIMARY KEY CHECK(order_id ~ '^[1-9][0-9]{0,8}$'),
 email text NOT NULL CHECK(email=lower(btrim(email))),
 minutes integer NOT NULL CHECK(minutes>0),
 remaining integer NOT NULL CHECK(remaining BETWEEN 0 AND minutes),
 expires_at timestamptz NOT NULL,
 voided boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gk2_private.punchcard_bookings (
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id),
 email text NOT NULL,
 cancelled_at timestamptz
);
CREATE TABLE IF NOT EXISTS gk2_private.punchcard_spending (
 reservation_id uuid REFERENCES gk2_private.punchcard_bookings(reservation_id),
 purchase_order text REFERENCES gk2_private.punchcard_purchases(order_id),
 minutes integer NOT NULL CHECK(minutes>0),
 PRIMARY KEY(reservation_id,purchase_order)
);
ALTER TABLE gk2_private.punchcard_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.punchcard_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.punchcard_spending ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON gk2_private.punchcard_purchases,gk2_private.punchcard_bookings,gk2_private.punchcard_spending TO service_role;
CREATE INDEX IF NOT EXISTS punchcard_email_idx ON gk2_private.punchcard_purchases(email,expires_at);
CREATE INDEX IF NOT EXISTS punchcard_booking_email_idx ON gk2_private.punchcard_bookings(email);

CREATE OR REPLACE FUNCTION public.gk2_punchcard_purchase(p_order text,p_email text,p_cancelled boolean DEFAULT false,p_qty integer DEFAULT 1,p_unit_minutes integer DEFAULT 600)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $$
DECLARE card gk2_private.punchcard_purchases%ROWTYPE; booking record; spent record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_unit_minutes IS NULL OR p_unit_minutes NOT IN (600,1200) THEN RAISE EXCEPTION 'invalid_pack'; END IF;
 IF p_qty IS NULL OR p_qty<1 OR p_qty>1000 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$' OR p_email IS NULL OR p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' THEN RAISE EXCEPTION 'invalid_purchase'; END IF;
 p_email:=lower(btrim(p_email));
 PERFORM pg_advisory_xact_lock(hashtextextended('punch:'||p_email,0));
 SELECT * INTO card FROM punchcard_purchases WHERE order_id=p_order FOR UPDATE;
 IF FOUND AND (card.email<>p_email OR card.minutes<>p_qty*p_unit_minutes) THEN RAISE EXCEPTION 'purchase_identity_mismatch'; END IF;
 IF NOT FOUND THEN
  INSERT INTO punchcard_purchases(order_id,email,minutes,remaining,expires_at,voided)
  VALUES(p_order,p_email,p_qty*p_unit_minutes,p_qty*p_unit_minutes,now()+interval '12 months',p_cancelled);
 ELSIF p_cancelled THEN
  UPDATE punchcard_purchases SET voided=true WHERE order_id=p_order;
  -- Merchant cancellation of the purchase revokes future prepaid bookings.
  FOR booking IN SELECT r.id,r.slot_date FROM reservations r JOIN punchcard_spending ps ON ps.reservation_id=r.id
   WHERE ps.purchase_order=p_order AND r.status='confirmed'
   AND ((r.slot_date::timestamp+make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo')>now()
   ORDER BY r.slot_date,r.id LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(booking.slot_date::text,0));
   UPDATE reservations SET status='cancelled',updated_at=now() WHERE id=booking.id;
   UPDATE punchcard_bookings SET cancelled_at=now() WHERE reservation_id=booking.id;
   FOR spent IN SELECT * FROM punchcard_spending WHERE reservation_id=booking.id LOOP
    UPDATE punchcard_purchases SET remaining=remaining+spent.minutes WHERE order_id=spent.purchase_order;
   END LOOP;
   UPDATE booking_access_codes SET status='cancel_requested',updated_at=now() WHERE reservation_id=booking.id AND status NOT IN ('revoked','revoking');
   INSERT INTO notification_outbox(reservation_id,kind) VALUES(booking.id,'booking_cancelled') ON CONFLICT DO NOTHING;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('ok',true);
END;$$;

CREATE OR REPLACE FUNCTION public.gk2_punchcard_account(p_email text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $$
DECLARE v_minutes integer; v_cards jsonb; v_bookings jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 p_email:=lower(btrim(p_email));
 SELECT coalesce(sum(remaining),0),coalesce(jsonb_agg(jsonb_build_object('order',order_id,'remaining',remaining,'expiresAt',expires_at) ORDER BY expires_at),'[]')
 INTO v_minutes,v_cards FROM punchcard_purchases WHERE email=p_email AND NOT voided AND expires_at>now();
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'date',r.slot_date,'startMin',r.start_min,'endMin',r.end_min,'status',r.status) ORDER BY r.slot_date DESC,r.start_min DESC),'[]')
 INTO v_bookings FROM (SELECT r.* FROM reservations r JOIN punchcard_bookings b ON b.reservation_id=r.id WHERE b.email=p_email ORDER BY r.slot_date DESC LIMIT 40) r;
 RETURN jsonb_build_object('ok',true,'email',p_email,'minutes',v_minutes,'cards',v_cards,'bookings',v_bookings);
END;$$;

CREATE OR REPLACE FUNCTION public.gk2_punchcard_book(p_email text,p_key uuid,p_day date,p_start integer,p_duration integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $$
DECLARE v_held jsonb; v_id uuid; card record; needed integer; take_minutes integer; existing record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 p_email:=lower(btrim(p_email));
 IF p_email IS NULL OR p_key IS NULL OR p_duration IS NULL OR p_duration<30 OR p_duration>240 OR p_duration%30<>0 THEN RAISE EXCEPTION 'invalid_booking'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('punch:'||p_email,0));
 SELECT r.*,b.email AS owner_email INTO existing FROM reservations r LEFT JOIN punchcard_bookings b ON b.reservation_id=r.id WHERE r.idempotency_key=p_key;
 IF FOUND THEN
  IF existing.owner_email IS DISTINCT FROM p_email OR existing.slot_date IS DISTINCT FROM p_day OR existing.start_min IS DISTINCT FROM p_start OR existing.end_min-existing.start_min<>p_duration THEN RAISE EXCEPTION 'key_reuse'; END IF;
  RETURN jsonb_build_object('ok',true,'id',existing.id,'status',existing.status,'duplicate',true);
 END IF;
 IF ((p_day::timestamp+make_interval(mins=>p_start)) AT TIME ZONE 'Europe/Oslo')<=now()+interval '20 minutes' THEN RAISE EXCEPTION 'out_of_window'; END IF;
 IF (SELECT coalesce(sum(remaining),0) FROM punchcard_purchases WHERE email=p_email AND NOT voided AND expires_at>now())<p_duration THEN RAISE EXCEPTION 'insufficient_minutes'; END IF;
 v_held:=public.gk2_hold_slot(p_key,p_day,'hyzr',p_start,p_duration,'gk-v1');
 v_id:=(v_held->>'id')::uuid;
 INSERT INTO punchcard_bookings(reservation_id,email) VALUES(v_id,p_email);
 needed:=p_duration;
 FOR card IN SELECT * FROM punchcard_purchases WHERE email=p_email AND NOT voided AND expires_at>now() AND remaining>0 ORDER BY expires_at,order_id FOR UPDATE LOOP
  take_minutes:=least(needed,card.remaining);
  UPDATE punchcard_purchases SET remaining=remaining-take_minutes WHERE order_id=card.order_id;
  INSERT INTO punchcard_spending VALUES(v_id,card.order_id,take_minutes);
  needed:=needed-take_minutes;
  EXIT WHEN needed=0;
 END LOOP;
 IF needed<>0 THEN RAISE EXCEPTION 'insufficient_minutes'; END IF;
 UPDATE reservations SET status='confirmed',hold_expires_at=NULL,customer_email=p_email,customer_ref='punchcard',paid_ore=0,quoted_ore=0,verified_paid_at=now(),terms_accepted_at=now(),updated_at=now() WHERE id=v_id;
 INSERT INTO notification_outbox(reservation_id,kind) VALUES(v_id,'booking_confirmed'),(v_id,'nuki_access_requested');
 RETURN jsonb_build_object('ok',true,'id',v_id,'status','confirmed','duplicate',false);
END;$$;

CREATE OR REPLACE FUNCTION public.gk2_punchcard_cancel(p_email text,p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $$
DECLARE booking reservations%ROWTYPE; spent record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 p_email:=lower(btrim(p_email));
 PERFORM pg_advisory_xact_lock(hashtextextended('punch:'||p_email,0));
 IF NOT EXISTS(SELECT 1 FROM punchcard_bookings WHERE reservation_id=p_reservation AND email=p_email) THEN RAISE EXCEPTION 'not_found'; END IF;
 SELECT * INTO booking FROM reservations WHERE id=p_reservation;
 PERFORM pg_advisory_xact_lock(hashtextextended(booking.slot_date::text,0));
 SELECT * INTO booking FROM reservations WHERE id=p_reservation FOR UPDATE;
 IF booking.status='cancelled' THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF booking.status<>'confirmed' OR ((booking.slot_date::timestamp+make_interval(mins=>booking.start_min)) AT TIME ZONE 'Europe/Oslo')<=now()+interval '30 minutes' THEN RAISE EXCEPTION 'cancellation_deadline'; END IF;
 UPDATE reservations SET status='cancelled',updated_at=now() WHERE id=p_reservation;
 UPDATE punchcard_bookings SET cancelled_at=now() WHERE reservation_id=p_reservation;
 FOR spent IN SELECT * FROM punchcard_spending WHERE reservation_id=p_reservation LOOP
  UPDATE punchcard_purchases SET remaining=remaining+spent.minutes WHERE order_id=spent.purchase_order;
 END LOOP;
 UPDATE booking_access_codes SET status='cancel_requested',updated_at=now() WHERE reservation_id=p_reservation AND status NOT IN ('revoked','revoking');
 INSERT INTO notification_outbox(reservation_id,kind) VALUES(p_reservation,'booking_cancelled') ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true,'duplicate',false);
END;$$;

REVOKE ALL ON FUNCTION public.gk2_punchcard_purchase(text,text,boolean,integer,integer),public.gk2_punchcard_account(text),public.gk2_punchcard_book(text,uuid,date,integer,integer),public.gk2_punchcard_cancel(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_punchcard_purchase(text,text,boolean,integer,integer),public.gk2_punchcard_account(text),public.gk2_punchcard_book(text,uuid,date,integer,integer),public.gk2_punchcard_cancel(text,uuid) TO service_role;
COMMIT;
