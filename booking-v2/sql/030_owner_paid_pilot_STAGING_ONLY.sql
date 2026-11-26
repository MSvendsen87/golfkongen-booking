-- Owner-only PAID Booking 2.0 pilot, staging snapshot 2026-10-27.
-- Requires Booking 2.0 reservation/claim/plan/lease/outbox schemas and
-- gk2_is_admin, gk2_booking_window and paid confirmation base functions.
-- Does NOT flip launch gates or publish Quickbutik products.
-- All RPCs remain service_role only.
CREATE TABLE IF NOT EXISTS gk2_private.owner_paid_pilots (
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id),
 actor_email text NOT NULL CHECK(length(actor_email) BETWEEN 5 AND 254),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gk2_private.owner_paid_pilots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.owner_paid_pilots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON gk2_private.owner_paid_pilots TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_claim_owner_paid_notification(p_actor text, p_reservation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'pilot_not_authorized'; END IF;
 SELECT o.id AS event_id,o.kind,o.reservation_id,
 r.quickbutik_order_id,r.customer_email,r.slot_date,r.resource,r.start_min,r.end_min,
 r.rental_sets_count,r.verified_paid_at,l.quickbutik_product_id
 INTO e
 FROM gk2_private.notification_outbox o
 JOIN gk2_private.reservations r ON r.id=o.reservation_id
 JOIN gk2_private.owner_paid_pilots op ON op.reservation_id=r.id
  AND op.actor_email=lower(btrim(p_actor))
 JOIN gk2_private.checkout_product_plans l
 ON l.resource=r.resource AND l.duration_minutes=r.end_min-r.start_min
 WHERE o.status='pending' AND o.next_attempt_at<=now() AND o.reservation_id=p_reservation
 AND o.kind IN ('booking_confirmed','nuki_access_requested','booking_cancelled')
 AND (
   (o.kind IN ('booking_confirmed','nuki_access_requested') AND r.status='confirmed')
   OR (o.kind='booking_cancelled' AND r.status IN ('cancelled','refunded'))
 )
 AND r.verified_paid_at IS NOT NULL
 AND r.quickbutik_order_id IS NOT NULL AND r.customer_email IS NOT NULL
 ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE gk2_private.notification_outbox
 SET status='sending',attempts=attempts+1,last_attempt_at=now(),last_error=NULL
 WHERE id=e.event_id;
 RETURN jsonb_build_object('eventId',e.event_id,'kind',e.kind,
 'bookingId',e.reservation_id,'orderId',e.quickbutik_order_id,
 'email',e.customer_email,'day',e.slot_date,'resource',e.resource,
 'startMin',e.start_min,'endMin',e.end_min,'rentalSets',e.rental_sets_count,
 'productId',e.quickbutik_product_id);
END;$function$;

CREATE OR REPLACE FUNCTION public.gk2_owner_match_paid_order_to_hold(p_actor text, p_order text, p_product_id integer, p_sku text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE m text[];day date;st integer;en integer;duration integer;
 e text:=lower(btrim(p_actor)); candidate gk2_private.reservations%ROWTYPE;
 n integer;expected_claims integer; actual_claims integer; existing uuid;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'pilot_not_authorized'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
 OR p_sku IS NULL OR p_product_id IS NULL
 OR p_actor IS NULL OR length(e)>254
 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'invalid_paid_order_match'; END IF;
 m:=regexp_match(p_sku,'^(20[0-9]{2}-[0-9]{2}-[0-9]{2})-([0-9]{4})-([0-9]{4})$');
 IF m IS NULL THEN RAISE EXCEPTION 'invalid_slot_sku'; END IF;
 BEGIN day:=m[1]::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid_slot_day'; END;
 st:=(substring(m[2],1,2)::int*60+substring(m[2],3,2)::int);
 en:=(substring(m[3],1,2)::int*60+substring(m[3],3,2)::int);
 duration:=en-st;
 IF st<0 OR en>1440 OR duration<=0 OR st%30<>0 OR en%30<>0 OR
 substring(m[2],3,2)::int>=60 OR substring(m[3],3,2)::int>=60
 THEN RAISE EXCEPTION 'invalid_slot_interval';END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(day::text,0));
 SELECT r.id INTO existing FROM gk2_private.reservations r
 JOIN gk2_private.owner_paid_pilots op ON op.reservation_id=r.id AND op.actor_email=e
 WHERE r.quickbutik_order_id=p_order LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('matched',true,'id',existing,'duplicate',true);
 END IF;
 SELECT count(*) INTO n
 FROM gk2_private.reservations r
 JOIN gk2_private.owner_paid_pilots op ON op.reservation_id=r.id AND op.actor_email=e
 JOIN gk2_private.checkout_product_plans p
 ON p.resource=r.resource AND p.duration_minutes=r.end_min-r.start_min
 WHERE p.quickbutik_product_id=p_product_id
 AND r.slot_date=day AND r.start_min=st AND r.end_min=en
 AND r.customer_email=e AND r.status='held' AND
 r.terms_accepted_at IS NOT NULL AND r.hold_expires_at>now();
 IF n<>1 THEN RETURN jsonb_build_object('matched',false,'reason','no_unique_live_hold');END IF;
 SELECT r.* INTO candidate
 FROM gk2_private.reservations r
 JOIN gk2_private.owner_paid_pilots op ON op.reservation_id=r.id AND op.actor_email=e
 JOIN gk2_private.checkout_product_plans p
 ON p.resource=r.resource AND p.duration_minutes=r.end_min-r.start_min
 WHERE p.quickbutik_product_id=p_product_id
 AND r.slot_date=day AND r.start_min=st AND r.end_min=en
 AND r.customer_email=e AND r.status='held'
 AND r.terms_accepted_at IS NOT NULL AND r.hold_expires_at>now()
 FOR UPDATE OF r;
 expected_claims:=(candidate.end_min-candidate.start_min)/30*
 CASE WHEN candidate.resource='venue' THEN 3 ELSE 1 END;
 SELECT count(*) INTO actual_claims FROM gk2_private.claims
 WHERE reservation_id=candidate.id;
 IF actual_claims<>expected_claims THEN
 RETURN jsonb_build_object('matched',false,'reason','claims_not_intact');END IF;
 UPDATE gk2_private.reservations
 SET quickbutik_order_id=p_order,status='payment_pending',updated_at=now()
 WHERE id=candidate.id;
 RETURN jsonb_build_object('matched',true,'id',candidate.id,'duplicate',false);
END;$function$;

CREATE OR REPLACE FUNCTION public.gk2_owner_paid_checkout_product_for(p_actor text, p_resource text, p_minutes integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE product_id integer;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'pilot_not_authorized'; END IF;
 IF p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
 OR p_minutes IS NULL OR p_minutes NOT BETWEEN 30 AND 720
 THEN RAISE EXCEPTION 'invalid_pilot_product'; END IF;
 SELECT quickbutik_product_id INTO product_id
 FROM gk2_private.checkout_product_plans
 WHERE resource=p_resource AND duration_minutes=p_minutes
 AND verified_variant_calendar;
 IF product_id IS NULL THEN RAISE EXCEPTION 'pilot_catalog_not_mapped';END IF;
 RETURN product_id;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_owner_paid_mark_opening(p_actor text, p_reservation uuid, p_product integer, p_sku text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE r gk2_private.reservations%ROWTYPE; existing gk2_private.checkout_variant_leases%ROWTYPE;
 exp_sku text; expected integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM gk2_private.owner_paid_pilots
  WHERE reservation_id=p_reservation AND actor_email=lower(btrim(p_actor)))
 OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'owner_pilot_not_authorized'; END IF;
 IF p_reservation IS NULL OR p_product NOT BETWEEN 1474 AND 1506 OR p_sku IS NULL
 THEN RAISE EXCEPTION 'invalid_variant_opening';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'hold_not_found';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF r.status<>'held' OR r.hold_expires_at<=now() OR r.customer_email IS NULL
 OR r.terms_accepted_at IS NULL OR r.quickbutik_order_id IS NOT NULL
 THEN RAISE EXCEPTION 'hold_not_prepared';END IF;
 SELECT quickbutik_product_id INTO expected FROM gk2_private.checkout_product_plans
 WHERE resource=r.resource AND duration_minutes=r.end_min-r.start_min
 AND verified_variant_calendar;
 IF expected IS NULL OR expected<>p_product THEN RAISE EXCEPTION 'checkout_plan_not_ready';END IF;
 exp_sku:=r.slot_date::text||'-'||
 lpad((r.start_min/60)::text,2,'0')||lpad((r.start_min%60)::text,2,'0')||'-'||
 lpad((r.end_min/60)::text,2,'0')||lpad((r.end_min%60)::text,2,'0');
 IF exp_sku<>p_sku THEN RAISE EXCEPTION 'wrong_held_slot_sku';END IF;
 SELECT * INTO existing FROM gk2_private.checkout_variant_leases
 WHERE reservation_id=p_reservation FOR UPDATE;
 IF FOUND THEN
  IF existing.product_id<>p_product OR existing.sku<>p_sku
   OR existing.status NOT IN ('opening','open')
  THEN RAISE EXCEPTION 'variant_lease_reuse_denied';END IF;
  RETURN false;
 END IF;
 INSERT INTO gk2_private.checkout_variant_leases(reservation_id,product_id,sku,status)
 VALUES(p_reservation,p_product,p_sku,'opening');
 RETURN true;
END;$function$;

CREATE OR REPLACE FUNCTION public.gk2_owner_paid_test_delivery_status(p_actor text, p_reservation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_status text;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'pilot_not_authorized';END IF;
 SELECT r.status INTO v_status FROM gk2_private.owner_paid_pilots op
 JOIN gk2_private.reservations r ON r.id=op.reservation_id
 WHERE op.reservation_id=p_reservation AND op.actor_email=lower(btrim(p_actor));
 IF v_status IS NULL THEN RAISE EXCEPTION 'pilot_not_found';END IF;
 RETURN jsonb_build_object(
   'bookingStatus',v_status,
   'pushSent',EXISTS(SELECT 1 FROM gk2_private.notification_outbox
       WHERE reservation_id=p_reservation AND kind='booking_confirmed' AND status='sent'),
   'accessEmailSent',EXISTS(SELECT 1 FROM gk2_private.notification_outbox
       WHERE reservation_id=p_reservation AND kind='nuki_access_requested' AND status='sent'),
   'needsReview',EXISTS(SELECT 1 FROM gk2_private.notification_outbox
       WHERE reservation_id=p_reservation AND status IN ('unknown','failed')),
   'pendingCount',(SELECT count(*) FROM gk2_private.notification_outbox
       WHERE reservation_id=p_reservation AND kind IN ('booking_confirmed','nuki_access_requested')
         AND status IN ('pending','sending'))
 );
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_owner_paid_test_hold(p_actor text, p_key uuid, p_day date, p_resource text, p_start integer, p_duration integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid;v_end integer;v_exp timestamptz:=now()+interval '10 minutes';
 v_existing gk2_private.reservations%ROWTYPE;v_resources text[];v_code text;v_slot integer;
 v_weekday integer;v_today date;v_mins integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'pilot_not_authorized'; END IF;
 IF p_key IS NULL OR p_day IS NULL OR p_resource IS NULL OR p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
   OR p_start IS NULL OR p_duration IS NULL OR 'gk-v1' IS NULL OR 'gk-v1' NOT LIKE 'gk-v%' THEN RAISE EXCEPTION 'bad_request'; END IF;
 IF p_day < (SELECT first_bookable_date FROM gk2_private.booking_settings WHERE singleton) THEN RAISE EXCEPTION 'first_bookable_date_2026_11_01';END IF;
 v_end:=p_start+p_duration;
 IF p_duration%30<>0 OR p_start%30<>0 OR p_start<0 OR v_end>1440 OR
  (p_resource='venue' AND (p_duration<240 OR p_duration>720 OR p_duration%60<>0)) OR
  (p_resource<>'venue' AND (p_duration<30 OR p_duration>240))
 THEN RAISE EXCEPTION 'invalid_duration';END IF;
 v_today:=(now() AT TIME ZONE 'Europe/Oslo')::date;
 v_mins:=extract(hour from now() AT TIME ZONE 'Europe/Oslo')::int*60+
         extract(minute from now() AT TIME ZONE 'Europe/Oslo')::int;
 IF p_day<v_today OR p_day>v_today+(SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton) OR (p_day=v_today AND p_start<v_mins+20) THEN RAISE EXCEPTION 'out_of_window';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT * INTO v_existing FROM gk2_private.reservations WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF NOT EXISTS (SELECT 1 FROM gk2_private.owner_paid_pilots WHERE reservation_id=v_existing.id AND actor_email=lower(btrim(p_actor)))
  THEN RAISE EXCEPTION 'pilot_key_not_owned'; END IF;
  IF v_existing.slot_date<>p_day OR v_existing.resource<>p_resource OR v_existing.start_min<>p_start OR v_existing.end_min<>v_end
  THEN RAISE EXCEPTION 'key_reuse';END IF;
  RETURN jsonb_build_object('id',v_existing.id,'status',v_existing.status,'hold_expires_at',v_existing.hold_expires_at);
 END IF;
 DELETE FROM gk2_private.claims c USING gk2_private.reservations b
 WHERE c.reservation_id=b.id AND b.slot_date=p_day AND b.status IN ('held','payment_pending') AND b.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=b.id AND l.status<>'closed');
 UPDATE gk2_private.reservations AS r SET status='expired',updated_at=now()
 WHERE r.slot_date=p_day AND r.status IN ('held','payment_pending') AND r.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=r.id AND l.status<>'closed');
 v_weekday:=extract(isodow from p_day)::int;
 v_resources:=CASE WHEN p_resource='venue' THEN ARRAY['hyzr','dart_a','dart_b']::text[] ELSE ARRAY[p_resource]::text[] END;
 IF EXISTS (SELECT 1 FROM unnest(array_append(v_resources,p_resource)) AS r(x)
   LEFT JOIN gk2_private.opening_hours h ON h.resource=r.x AND h.weekday=v_weekday
   WHERE h.resource IS NULL OR h.active=false OR p_start<h.opens_min OR v_end>h.closes_min)
 THEN RAISE EXCEPTION 'closed_hours';END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.blocks bl WHERE bl.active AND p_day BETWEEN bl.date_from AND bl.date_to
  AND (bl.weekdays IS NULL OR array_length(bl.weekdays,1) IS NULL OR v_weekday=ANY(bl.weekdays))
  AND p_start<bl.end_min AND v_end>bl.start_min
  AND (bl.target='all' OR (bl.target='venue_only' AND p_resource='venue')
       OR bl.target=ANY(v_resources))) THEN RAISE EXCEPTION 'blocked_time';END IF;
 IF p_resource IN ('dart_a','dart_b','venue') AND p_start<1320 AND v_end>1140
 AND EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND ce.hold_expires_at>now()))) THEN RAISE EXCEPTION 'club_already_reserved'; END IF;
 INSERT INTO gk2_private.reservations(idempotency_key,slot_date,resource,start_min,end_min,status,hold_expires_at,terms_version)
 VALUES(p_key,p_day,p_resource,p_start,v_end,'held',v_exp,'gk-v1') RETURNING id INTO v_id;
 FOREACH v_code IN ARRAY v_resources LOOP
  FOR v_slot IN SELECT generate_series(p_start,v_end-30,30) LOOP
   INSERT INTO gk2_private.claims(physical_resource,slot_date,slot_min,reservation_id)
   VALUES(v_code,p_day,v_slot,v_id);
  END LOOP;
 END LOOP;
 INSERT INTO gk2_private.owner_paid_pilots(reservation_id,actor_email)
 VALUES(v_id,lower(btrim(p_actor)));
 RETURN jsonb_build_object('id',v_id,'status','held','hold_expires_at',v_exp);
END; $function$;

REVOKE ALL ON FUNCTION public.gk2_claim_owner_paid_notification(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_claim_owner_paid_notification(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_owner_match_paid_order_to_hold(text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_owner_match_paid_order_to_hold(text,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_owner_paid_checkout_product_for(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_owner_paid_checkout_product_for(text,text,integer) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_owner_paid_mark_opening(text,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_owner_paid_mark_opening(text,uuid,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_owner_paid_test_delivery_status(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_owner_paid_test_delivery_status(text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_owner_paid_test_hold(text,uuid,date,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_owner_paid_test_hold(text,uuid,date,text,integer,integer) TO service_role;