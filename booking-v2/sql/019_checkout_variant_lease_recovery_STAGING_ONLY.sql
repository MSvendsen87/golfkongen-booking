-- Booking 2.0 STAGING ONLY: track each opened Quickbutik cart variant.
-- Never release an expired hold if its Quickbutik variant has not been re-locked.
BEGIN;
CREATE TABLE IF NOT EXISTS gk2_private.checkout_variant_leases(
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id),
 product_id integer NOT NULL CHECK(product_id BETWEEN 1474 AND 1506),
 sku text NOT NULL CHECK(sku ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{4}-[0-9]{4}$'),
 variant_id integer CHECK(variant_id IS NULL OR variant_id>0),
 status text NOT NULL CHECK(status IN ('opening','open','closing','relock_failed','closed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 opened_at timestamptz,
 last_attempt_at timestamptz,
 closed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkout_variant_leases_status_idx
 ON gk2_private.checkout_variant_leases(status,updated_at);
ALTER TABLE gk2_private.checkout_variant_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.checkout_variant_leases FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.checkout_variant_leases TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_mark_cart_variant_opening(
 p_reservation uuid,p_product integer,p_sku text
) RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE r gk2_private.reservations%ROWTYPE; existing gk2_private.checkout_variant_leases%ROWTYPE;
 exp_sku text; expected integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
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
 AND is_ready AND publish_enabled AND verified_variant_calendar
 AND verified_checkout_payment AND verified_group_prices;
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
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_mark_cart_variant_open(
 p_reservation uuid,p_variant_id integer
) RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE l gk2_private.checkout_variant_leases%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_variant_id IS NULL OR p_variant_id<=0
 THEN RAISE EXCEPTION 'invalid_variant_id';END IF;
 SELECT * INTO l FROM gk2_private.checkout_variant_leases
 WHERE reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND OR l.status NOT IN ('opening','open')
 OR (l.variant_id IS NOT NULL AND l.variant_id<>p_variant_id)
 THEN RAISE EXCEPTION 'untracked_cart_variant';END IF;
 UPDATE gk2_private.checkout_variant_leases
 SET status='open',variant_id=p_variant_id,
 opened_at=coalesce(opened_at,now()),updated_at=now()
 WHERE reservation_id=p_reservation;
 RETURN true;
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_take_expired_cart_leases(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE results jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_cleanup_limit';END IF;
 WITH candidate AS (
  SELECT l.reservation_id
  FROM gk2_private.checkout_variant_leases l
  JOIN gk2_private.reservations r ON r.id=l.reservation_id
  WHERE r.status IN ('held','payment_pending')
  AND r.hold_expires_at < now()-interval '60 seconds'
  AND (l.status IN ('opening','open','relock_failed')
    OR (l.status='closing' AND l.last_attempt_at < now()-interval '3 minutes'))
  AND l.attempts < 10
  ORDER BY r.hold_expires_at
  LIMIT p_limit
  FOR UPDATE OF l SKIP LOCKED
 ), transitioned AS (
  UPDATE gk2_private.checkout_variant_leases l
  SET status='closing',last_attempt_at=now(),attempts=l.attempts+1,updated_at=now()
  FROM candidate c
  WHERE l.reservation_id=c.reservation_id
  RETURNING l.reservation_id,l.product_id,l.sku,l.variant_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'reservationId',reservation_id,'productId',product_id,'sku',sku,
 'variantId',variant_id)), '[]'::jsonb) INTO results FROM transitioned;
 RETURN results;
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_finish_cart_variant_relock(
 p_reservation uuid,p_success boolean
) RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $f$
DECLARE r gk2_private.reservations%ROWTYPE;l gk2_private.checkout_variant_leases%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_success IS NULL THEN RAISE EXCEPTION 'invalid_relock_result';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'reservation_missing';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 SELECT * INTO l FROM gk2_private.checkout_variant_leases
 WHERE reservation_id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_checkout_lease';END IF;
 IF l.status='closed' THEN RETURN true;END IF;
 IF l.status NOT IN ('opening','open','closing','relock_failed')
 THEN RAISE EXCEPTION 'invalid_checkout_lease_state';END IF;
 IF p_success IS DISTINCT FROM true THEN
  UPDATE gk2_private.checkout_variant_leases
  SET status='relock_failed',updated_at=now() WHERE reservation_id=p_reservation;
  RETURN false;
 END IF;
 UPDATE gk2_private.checkout_variant_leases
 SET status='closed',closed_at=now(),updated_at=now()
 WHERE reservation_id=p_reservation;
 -- Close the cart first; then the calendar hold may be cleared.
 IF r.status IN ('held','payment_pending') AND r.hold_expires_at<=now() THEN
  DELETE FROM gk2_private.claims WHERE reservation_id=p_reservation;
  UPDATE gk2_private.reservations SET status='expired',updated_at=now()
  WHERE id=p_reservation;
 END IF;
 RETURN true;
END;$f$;

REVOKE ALL ON FUNCTION public.gk2_mark_cart_variant_opening(uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_mark_cart_variant_open(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_take_expired_cart_leases(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_finish_cart_variant_relock(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_mark_cart_variant_opening(uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_mark_cart_variant_open(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_take_expired_cart_leases(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_finish_cart_variant_relock(uuid,boolean) TO service_role;
COMMIT;
