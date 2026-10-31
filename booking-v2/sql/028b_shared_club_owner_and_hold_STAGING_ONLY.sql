-- Booking 2.0 shared club owner and hold functions, staging snapshot 2026-10-27.
-- Requires 028a and earlier Booking 2.0 release gate/claims tables.
CREATE OR REPLACE FUNCTION public.gk2_admin_list_club_access(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM gk2_private.admin_allowlist WHERE lower(email)=lower(p_actor) AND active)
 THEN RAISE EXCEPTION 'admin_forbidden'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('customerId',customer_id,'active',active) ORDER BY customer_id),'[]'::jsonb)
 INTO v_result FROM gk2_private.club_access_stage;
 RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_admin_set_club_access(p_actor text, p_customer text, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM gk2_private.admin_allowlist WHERE lower(email)=lower(p_actor) AND active)
 THEN RAISE EXCEPTION 'admin_forbidden'; END IF;
 IF p_customer IS NULL OR p_customer !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR p_active IS NULL THEN RAISE EXCEPTION 'invalid_member'; END IF;
 INSERT INTO gk2_private.club_access_stage(customer_id,active) VALUES(trim(p_customer),p_active)
 ON CONFLICT(customer_id) DO UPDATE SET active=excluded.active;
 INSERT INTO gk2_private.club_access_audit(customer_id,actor,active) VALUES(trim(p_customer),lower(p_actor),p_active);
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_bind_club_verified_email(p_enrolment uuid, p_customer text, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_enrolment IS NULL OR p_customer IS NULL OR p_email IS NULL OR length(trim(p_email))>254
 OR trim(p_email) !~ '^[^ @]+@[^ @]+[.][^ @]+$' THEN RAISE EXCEPTION 'invalid_club_contact'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF NOT FOUND OR e.customer_id<>p_customer OR e.status<>'held' OR e.hold_expires_at<=now() THEN RAISE EXCEPTION 'hold_contact_mismatch'; END IF;
 IF e.verified_customer_email IS NOT NULL AND e.verified_customer_email<>lower(trim(p_email)) THEN RAISE EXCEPTION 'club_contact_already_bound'; END IF;
 UPDATE gk2_private.club_enrolments SET verified_customer_email=lower(trim(p_email)) WHERE id=p_enrolment;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_club_day_status(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_used integer; v_dart boolean; v_horizon integer;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_day IS NULL OR extract(isodow from p_day)<>4 THEN RAISE EXCEPTION 'not_club_thursday'; END IF;
 SELECT horizon_days INTO v_horizon FROM gk2_private.booking_settings WHERE singleton;
 IF p_day < (now() AT TIME ZONE 'Europe/Oslo')::date OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date + v_horizon
 THEN RAISE EXCEPTION 'date_out_of_window'; END IF;
 SELECT coalesce(sum(seats),0) INTO v_used FROM gk2_private.club_enrolments
 WHERE slot_date=p_day AND (status='confirmed' OR (status IN ('held','payment_pending') AND hold_expires_at>now()));
 SELECT EXISTS(
 SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND c.physical_resource IN ('dart_a','dart_b')
 AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND (r.hold_expires_at>now()
 OR EXISTS(SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))))
 ) INTO v_dart;
 RETURN jsonb_build_object('date',p_day,'capacity',10,'reserved',v_used,'remaining',CASE WHEN v_dart THEN 0 ELSE 10-v_used END,
 'canBook',NOT v_dart AND v_used<10,'reason',CASE WHEN v_dart THEN 'dart_reserved' WHEN v_used>=10 THEN 'club_full' ELSE null END);
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_hold_club_seats(p_key uuid, p_day date, p_customer text, p_seats integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_row gk2_private.club_enrolments%ROWTYPE; v_count integer; v_id uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM gk2_private.release_gates WHERE singleton
 AND legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
 AND checkout_paid_webhook_verified AND pushover_end_to_end_verified AND admin_auth_verified
 AND concurrency_verified AND legacy_cron_switch_verified)
 THEN RAISE EXCEPTION 'gk2_launch_locked'; END IF;
 IF p_key IS NULL OR p_day IS NULL OR extract(isodow from p_day)<>4
 OR p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 10 OR p_customer IS NULL
 OR p_day < (now() AT TIME ZONE 'Europe/Oslo')::date
 OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date + (SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton)
 THEN RAISE EXCEPTION 'invalid_club_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT * INTO v_row FROM gk2_private.club_enrolments WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
   IF v_row.slot_date<>p_day OR v_row.customer_id<>p_customer OR v_row.seats<>p_seats THEN RAISE EXCEPTION 'key_reuse'; END IF;
   RETURN jsonb_build_object('id',v_row.id,'status',v_row.status);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM gk2_private.club_access_stage WHERE customer_id=p_customer AND active) THEN
 RAISE EXCEPTION 'club_access_denied'; END IF;
 IF EXISTS(
 SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND c.physical_resource IN ('dart_a','dart_b') AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND
 (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))))
 ) THEN RAISE EXCEPTION 'dart_already_reserved'; END IF;
 SELECT coalesce(sum(seats),0) INTO v_count FROM gk2_private.club_enrolments
 WHERE slot_date=p_day AND (status='confirmed' OR (status IN ('held','payment_pending') AND hold_expires_at>now()));
 IF v_count+p_seats>10 THEN RAISE EXCEPTION 'club_full'; END IF;
 INSERT INTO gk2_private.club_enrolments(idempotency_key,slot_date,customer_id,seats,status,hold_expires_at)
 VALUES(p_key,p_day,p_customer,p_seats,'held',now()+interval '10 minutes') RETURNING id INTO v_id;
 RETURN jsonb_build_object('id',v_id,'status','held','remaining',10-v_count-p_seats);
END $function$;

REVOKE ALL ON FUNCTION public.gk2_admin_list_club_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_list_club_access(text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_admin_set_club_access(text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_set_club_access(text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_bind_club_verified_email(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_bind_club_verified_email(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_club_day_status(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_club_day_status(date) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_hold_club_seats(uuid,date,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hold_club_seats(uuid,date,text,integer) TO service_role;
