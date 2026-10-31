-- Booking 2.0 staging patch applied and rollback-tested 2026-10-27.
-- Requires earlier reservation and club-table migrations.
-- Do not change release gates or Quickbutik product visibility here.
CREATE OR REPLACE FUNCTION public.gk2_checkout_hold_expires(p_reservation uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_expires timestamptz;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reservation IS NULL THEN RAISE EXCEPTION 'invalid_reservation'; END IF;
 SELECT r.hold_expires_at INTO v_expires
 FROM gk2_private.reservations r
 JOIN gk2_private.checkout_variant_leases l ON l.reservation_id=r.id
 WHERE r.id=p_reservation AND r.status='held'
 AND r.terms_version='gk-v1' AND l.status='open'
 AND r.hold_expires_at>now();
 IF v_expires IS NULL THEN RAISE EXCEPTION 'checkout_not_open'; END IF;
 RETURN v_expires;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_mark_cart_variant_open(p_reservation uuid, p_variant_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE r gk2_private.reservations%ROWTYPE;
 l gk2_private.checkout_variant_leases%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reservation IS NULL OR p_variant_id IS NULL OR p_variant_id<=0
 THEN RAISE EXCEPTION 'invalid_variant_id'; END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'hold_not_found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 SELECT * INTO l FROM gk2_private.checkout_variant_leases
 WHERE reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND OR l.status NOT IN ('opening','open')
 OR (l.variant_id IS NOT NULL AND l.variant_id<>p_variant_id)
 THEN RAISE EXCEPTION 'untracked_cart_variant'; END IF;
 IF l.status='open' THEN
  IF l.variant_id<>p_variant_id THEN RAISE EXCEPTION 'variant_lease_mismatch'; END IF;
  RETURN true;
 END IF;
 IF r.status<>'held' OR r.quickbutik_order_id IS NOT NULL
 OR r.hold_expires_at IS NULL OR r.hold_expires_at<=now()
 OR r.customer_email IS NULL OR r.terms_accepted_at IS NULL
 THEN RAISE EXCEPTION 'hold_not_payable'; END IF;
 -- Once the verified Quickbutik variant is open, allow a full checkout window.
 -- This runs only once per hold; idempotent retries cannot extend it further.
 UPDATE gk2_private.reservations
 SET hold_expires_at=greatest(r.hold_expires_at,now()+interval '30 minutes'),updated_at=now()
 WHERE id=p_reservation;
 UPDATE gk2_private.checkout_variant_leases
 SET status='open',variant_id=p_variant_id,
 opened_at=coalesce(opened_at,now()),updated_at=now()
 WHERE reservation_id=p_reservation;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_match_club_paid_order(p_order text, p_sku text, p_email text, p_seats integer, p_paid_ore integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
 v gk2_private.club_checkout_variants%ROWTYPE;
 v_count integer;
 v_email text:=lower(btrim(p_email));
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
 OR p_sku IS NULL OR p_email IS NULL OR length(v_email)>254
 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 OR p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 10
 OR p_paid_ore IS DISTINCT FROM p_seats*5000 THEN
  RAISE EXCEPTION 'invalid_club_paid_order'; END IF;
 SELECT * INTO v FROM gk2_private.club_checkout_variants WHERE sku=p_sku;
 IF NOT FOUND OR v.price_ore<>5000 THEN RAISE EXCEPTION 'unrecognized_club_sku'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v.slot_date::text,0));
 -- The same trusted webhook may arrive repeatedly while other customers have holds.
 -- Match an already-confirmed order FIRST, without counting unrelated holds.
 SELECT * INTO e FROM gk2_private.club_enrolments
 WHERE quickbutik_order_id=p_order FOR UPDATE;
 IF FOUND THEN
   IF e.slot_date=v.slot_date AND e.seats=p_seats
    AND e.verified_customer_email=v_email AND e.status='confirmed'
   THEN RETURN jsonb_build_object('matched',true,'alreadyConfirmed',true,'enrolmentId',e.id);
   END IF;
   RETURN jsonb_build_object('matched',false,'reason','existing_order_conflict');
 END IF;
 SELECT count(*) INTO v_count FROM gk2_private.club_enrolments
 WHERE slot_date=v.slot_date AND seats=p_seats AND verified_customer_email=v_email
 AND status IN ('held','payment_pending') AND hold_expires_at>now();
 IF v_count<>1 THEN
  RETURN jsonb_build_object('matched',false,'reason','non_unique_or_expired_hold');
 END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments
 WHERE slot_date=v.slot_date AND seats=p_seats AND verified_customer_email=v_email
 AND status IN ('held','payment_pending') AND hold_expires_at>now()
 FOR UPDATE;
 IF EXISTS (SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r
 ON r.id=c.reservation_id WHERE c.slot_date=v.slot_date
 AND c.physical_resource IN ('dart_a','dart_b') AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND
   (r.hold_expires_at>now() OR EXISTS (
     SELECT 1 FROM gk2_private.checkout_variant_leases l
     WHERE l.reservation_id=r.id AND l.status<>'closed'
   ))))
 ) THEN RETURN jsonb_build_object('matched',false,'reason','dart_conflict'); END IF;
 UPDATE gk2_private.club_enrolments
 SET status='confirmed',quickbutik_order_id=p_order,verified_paid_at=now()
 WHERE id=e.id;
 RETURN jsonb_build_object('matched',true,'alreadyConfirmed',false,'enrolmentId',e.id);
END $function$;

REVOKE ALL ON FUNCTION public.gk2_checkout_hold_expires(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_checkout_hold_expires(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_mark_cart_variant_open(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_mark_cart_variant_open(uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_match_club_paid_order(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_match_club_paid_order(text,text,text,integer,integer) TO service_role;
