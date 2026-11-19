-- Booking 2.0 STAGING: guarded cart-first Quickbutik checkout helper RPCs.
-- No launch flags or parent product visibility changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_checkout_product_for(
 p_resource text,p_minutes integer
) RETURNS integer LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE product_id integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_resource NOT IN ('hyzr','dart_a','dart_b','venue') OR
 p_minutes IS NULL OR p_minutes<30 OR p_minutes>720
 THEN RAISE EXCEPTION 'invalid_plan_request';END IF;
 SELECT p.quickbutik_product_id INTO product_id FROM gk2_private.checkout_product_plans p
 WHERE p.resource=p_resource AND p.duration_minutes=p_minutes
 AND p.is_ready AND p.publish_enabled AND p.verified_variant_calendar
 AND p.verified_checkout_payment AND p.verified_group_prices;
 RETURN product_id;
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_abort_precheckout_hold(p_reservation uuid)
RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE r gk2_private.reservations%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL THEN RAISE EXCEPTION 'invalid_hold';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF r.status<>'held' OR r.quickbutik_order_id IS NOT NULL
 THEN RETURN false;END IF;
 DELETE FROM gk2_private.claims WHERE reservation_id=r.id;
 UPDATE gk2_private.reservations SET status='expired',hold_expires_at=now(),updated_at=now()
 WHERE id=r.id;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.gk2_checkout_product_for(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_abort_precheckout_hold(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_checkout_product_for(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_abort_precheckout_hold(uuid) TO service_role;
COMMIT;
