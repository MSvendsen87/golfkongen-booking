-- Booking 2.0 club checkout, paid/cancel guards, staging snapshot 2026-10-27.
-- Requires 028a,028b. Paid verification must be performed by trusted Quickbutik webhook BEFORE these RPCs.
CREATE OR REPLACE FUNCTION public.gk2_cancel_club_by_order(p_order text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid; v_date date; v_status text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'bad_order'; END IF;
 SELECT id,slot_date,status INTO v_id,v_date,v_status FROM gk2_private.club_enrolments WHERE quickbutik_order_id=p_order FOR UPDATE;
 IF v_id IS NULL THEN RETURN jsonb_build_object('matched',false); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_date::text,0));
 IF v_status='cancelled' THEN RETURN jsonb_build_object('matched',true,'alreadyCancelled',true); END IF;
 IF v_status<>'confirmed' THEN RAISE EXCEPTION 'club_not_confirmed'; END IF;
 UPDATE gk2_private.club_enrolments SET status='cancelled' WHERE id=v_id;
 RETURN jsonb_build_object('matched',true,'alreadyCancelled',false);
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_cancel_club_enrolment(p_enrolment uuid, p_verified_cancelled_order text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_enrolment IS NULL OR p_verified_cancelled_order IS NULL THEN RAISE EXCEPTION 'invalid_cancel_request'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'club_enrolment_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.slot_date::text,0));
 IF e.quickbutik_order_id IS DISTINCT FROM p_verified_cancelled_order THEN RAISE EXCEPTION 'cancel_order_mismatch'; END IF;
 IF e.status='cancelled' THEN RETURN jsonb_build_object('status','cancelled','alreadyCancelled',true); END IF;
 IF e.status<>'confirmed' THEN RAISE EXCEPTION 'cannot_cancel_unconfirmed'; END IF;
 UPDATE gk2_private.club_enrolments SET status='cancelled' WHERE id=p_enrolment;
 RETURN jsonb_build_object('status','cancelled','alreadyCancelled',false);
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_club_checkout_plan(p_hold uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE; v gk2_private.club_checkout_variants%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_hold IS NULL THEN RAISE EXCEPTION 'invalid_hold'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_hold FOR UPDATE;
 IF NOT FOUND OR e.status<>'held' OR e.hold_expires_at<=now() OR e.verified_customer_email IS NULL
 THEN RAISE EXCEPTION 'club_hold_not_ready'; END IF;
 SELECT * INTO v FROM gk2_private.club_checkout_variants WHERE slot_date=e.slot_date;
 IF NOT FOUND OR NOT v.enabled THEN RAISE EXCEPTION 'club_checkout_variant_disabled'; END IF;
 RETURN jsonb_build_object('productId',v.quickbutik_product_id,'variantId',v.quickbutik_variant_id,
 'sku',v.sku,'quantity',e.seats,'amountOre',e.seats*v.price_ore);
END $function$;

CREATE OR REPLACE FUNCTION public.gk2_confirm_club_paid(p_enrolment uuid, p_order text, p_paid_ore integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_enrolment IS NULL OR p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$' OR p_paid_ore IS NULL THEN
 RAISE EXCEPTION 'bad_payment_reference'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'club_hold_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.slot_date::text,0));
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF e.status='confirmed' THEN
   IF e.quickbutik_order_id=p_order AND p_paid_ore=e.seats*5000 THEN
    RETURN jsonb_build_object('status','confirmed','alreadyConfirmed',true);
   END IF;
   RAISE EXCEPTION 'confirmed_payment_mismatch';
 END IF;
 IF e.status NOT IN ('held','payment_pending') OR e.hold_expires_at<=now()
 THEN RAISE EXCEPTION 'hold_expired_manual_review'; END IF;
 IF p_paid_ore<>e.seats*5000 THEN RAISE EXCEPTION 'paid_amount_mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=e.slot_date AND c.physical_resource IN ('dart_a','dart_b')
 AND c.slot_min BETWEEN 1140 AND 1290 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending')
 AND (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
 WHERE l.reservation_id=r.id AND l.status<>'closed'))))) THEN RAISE EXCEPTION 'dart_conflict_manual_review'; END IF;
 UPDATE gk2_private.club_enrolments SET status='confirmed',quickbutik_order_id=p_order,verified_paid_at=now()
 WHERE id=p_enrolment;
 RETURN jsonb_build_object('status','confirmed','alreadyConfirmed',false);
END $function$;

REVOKE ALL ON FUNCTION public.gk2_cancel_club_by_order(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_cancel_club_by_order(text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_cancel_club_enrolment(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_cancel_club_enrolment(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_club_checkout_plan(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_club_checkout_plan(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.gk2_confirm_club_paid(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_confirm_club_paid(uuid,text,integer) TO service_role;
