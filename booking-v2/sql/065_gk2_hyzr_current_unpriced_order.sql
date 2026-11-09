-- Service-role-only lookup of ONE unpriced, server-paid HYZR session.
-- Read-only candidate for fresh Quickbutik V1 net amount verification.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_current_unpriced_order(p_at timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE r gk2_private.reservations%ROWTYPE;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_at IS NULL OR p_at<now()-interval '3 minutes' OR p_at>now()+interval '3 minutes'
 THEN RETURN jsonb_build_object('ok',false,'reason','invalid_time');END IF;
 SELECT * INTO r
 FROM gk2_private.reservations b
 WHERE b.resource='hyzr' AND b.status='confirmed'
 AND b.verified_paid_at IS NOT NULL AND b.paid_ore IS NULL
 AND b.customer_ref IS DISTINCT FROM 'punchcard'
 AND b.quickbutik_order_id ~ '^[1-9][0-9]{0,8}$'
 AND b.customer_email IS NOT NULL
 AND p_at >= ((b.slot_date::timestamp+make_interval(mins=>b.start_min)) AT TIME ZONE 'Europe/Oslo')
 AND p_at < ((b.slot_date::timestamp+make_interval(mins=>b.end_min+10)) AT TIME ZONE 'Europe/Oslo')
 ORDER BY b.start_min DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'unpriced',false);END IF;
 RETURN jsonb_build_object(
   'ok',true,'unpriced',true,'reservationId',r.id,
   'orderNumber',r.quickbutik_order_id,'slotDate',r.slot_date,
   'startMin',r.start_min,'endMin',r.end_min,
   'customerEmail',lower(trim(r.customer_email))
 );
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_current_unpriced_order(timestamptz)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_current_unpriced_order(timestamptz) TO service_role;