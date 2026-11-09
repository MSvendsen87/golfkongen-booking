-- Reconcile the actually paid Quickbutik NET amount for confirmed HYZR
-- bookings only. This is a service-only primitive used AFTER remote paid-order
-- and email/SKU/product verification. Cannot rewrite price after extension.
CREATE TABLE IF NOT EXISTS gk2_private.hyzr_order_amount_reconciliations(
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id) ON DELETE RESTRICT,
 quickbutik_order_id text NOT NULL,
 paid_ore integer NOT NULL CHECK (paid_ore BETWEEN 100 AND 100000000),
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gk2_private.hyzr_order_amount_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.hyzr_order_amount_reconciliations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON gk2_private.hyzr_order_amount_reconciliations TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_missing_paid_amount_orders(p_max integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_items jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_max IS NULL OR p_max NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_limit';END IF;
 SELECT coalesce(jsonb_agg(q.quickbutik_order_id ORDER BY q.slot_date,q.quickbutik_order_id),'[]'::jsonb)
 INTO v_items FROM (
 SELECT r.quickbutik_order_id,r.slot_date FROM gk2_private.reservations r
 WHERE r.resource='hyzr' AND r.status='confirmed'
 AND r.verified_paid_at IS NOT NULL AND r.paid_ore IS NULL
 AND r.quickbutik_order_id ~ '^[1-9][0-9]{0,8}$'
 AND NOT EXISTS(SELECT 1 FROM gk2_private.hyzr_extension_holds h WHERE h.reservation_id=r.id)
 ORDER BY r.slot_date,r.quickbutik_order_id LIMIT p_max
 ) q;
 RETURN jsonb_build_object('ok',true,'orders',v_items);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_missing_paid_amount_orders(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_missing_paid_amount_orders(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_record_verified_net_amount(
 p_reservation uuid,p_order text,p_paid_ore integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE r gk2_private.reservations%ROWTYPE;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
    OR p_paid_ore IS NULL OR p_paid_ore NOT BETWEEN 100 AND 100000000
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_verified_amount');END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','booking_not_found');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF r.resource<>'hyzr' OR r.status<>'confirmed' OR r.verified_paid_at IS NULL
    OR r.quickbutik_order_id IS DISTINCT FROM p_order
    OR r.customer_ref='punchcard'
 THEN RETURN jsonb_build_object('ok',false,'code','booking_not_eligible');END IF;
 IF r.paid_ore IS NOT NULL THEN
  RETURN CASE WHEN r.paid_ore=p_paid_ore THEN
   jsonb_build_object('ok',true,'duplicate',true,'paidOre',r.paid_ore)
   ELSE jsonb_build_object('ok',false,'code','already_paid_amount_conflict') END;
 END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.hyzr_extension_holds h WHERE h.reservation_id=r.id)
    OR EXISTS(SELECT 1 FROM gk2_private.hyzr_extension_rate_basis b WHERE b.reservation_id=r.id)
 THEN RETURN jsonb_build_object('ok',false,'code','extension_price_frozen');END IF;
 UPDATE gk2_private.reservations
 SET paid_ore=p_paid_ore,updated_at=now()
 WHERE id=r.id AND paid_ore IS NULL;
 INSERT INTO gk2_private.hyzr_order_amount_reconciliations
 (reservation_id,quickbutik_order_id,paid_ore) VALUES(r.id,p_order,p_paid_ore)
 ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'paidOre',p_paid_ore);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_record_verified_net_amount(uuid,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_record_verified_net_amount(uuid,text,integer) TO service_role;
