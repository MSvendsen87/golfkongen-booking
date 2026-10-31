BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_take_expired_cart_leases(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE results jsonb; v_day date;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_cleanup_limit';END IF;
 -- Share the same date mutex as checkout creation. Closing leases stay
 -- non-closed during the external write, preventing variant reuse.
 FOR v_day IN SELECT DISTINCT r.slot_date
 FROM gk2_private.checkout_variant_leases l
 JOIN gk2_private.reservations r ON r.id=l.reservation_id
 WHERE l.status<>'closed' ORDER BY r.slot_date
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(v_day::text,0));
 END LOOP;
 WITH candidate AS (
  SELECT l.reservation_id
  FROM gk2_private.checkout_variant_leases l
  JOIN gk2_private.reservations r ON r.id=l.reservation_id
  WHERE (r.status IN ('cancelled','refunded','expired')
    OR (r.status IN ('held','payment_pending')
     AND r.hold_expires_at < now()-interval '60 seconds'))
  AND NOT EXISTS (
   SELECT 1 FROM gk2_private.checkout_variant_leases other
   JOIN gk2_private.reservations active_r ON active_r.id=other.reservation_id
   WHERE other.product_id=l.product_id AND other.sku=l.sku
   AND other.reservation_id<>l.reservation_id AND other.status<>'closed'
   AND (active_r.status IN ('confirmed','paid_unallocated')
     OR (active_r.status IN ('held','payment_pending')
      AND active_r.hold_expires_at>=now()-interval '60 seconds'))
  )
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
END;$function$;

CREATE OR REPLACE FUNCTION public.gk2_mark_cart_variant_opening(p_reservation uuid, p_product integer, p_sku text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
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
 IF EXISTS (
  SELECT 1 FROM gk2_private.checkout_variant_leases
  WHERE product_id=p_product AND sku=p_sku
   AND reservation_id<>p_reservation AND status<>'closed'
 ) THEN RAISE EXCEPTION 'variant_cleanup_pending'; END IF;
 INSERT INTO gk2_private.checkout_variant_leases(reservation_id,product_id,sku,status)
 VALUES(p_reservation,p_product,p_sku,'opening');
 RETURN true;
END;$function$;

COMMIT;
