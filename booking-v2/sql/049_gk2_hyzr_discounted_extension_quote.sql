-- Preview-only, no checkout or inventory mutation.
-- Quotes preserve exactly the original verified effective hourly price and member discounts.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_quote(
 p_reservation uuid,p_extra_minutes integer,p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE r gk2_private.reservations%ROWTYPE;
 v_now timestamptz:=coalesce(p_at,now());
 v_starts timestamptz;v_ends timestamptz;
 v_weekday integer;v_close integer;v_price_ore integer;
 v_needs_punchcard boolean;
 v_possible boolean;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_extra_minutes IS NULL OR
    p_extra_minutes NOT IN (30,60,90,120,150,180,210,240)
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_extension_duration');END IF;
 IF p_at IS NULL OR p_at<now()-interval '90 days' OR p_at>now()+interval '45 days'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_time');END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND OR r.resource<>'hyzr' OR r.status<>'confirmed'
    OR r.verified_paid_at IS NULL OR r.paid_ore IS NULL
 THEN RETURN jsonb_build_object('ok',false,'code','not_verified_hyzr_booking');END IF;
 v_starts:=(r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo';
 v_ends:=(r.slot_date::timestamp+make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo';
 IF v_now < v_starts OR v_now >= v_ends+interval '10 minutes'
 THEN RETURN jsonb_build_object('ok',false,'code','extension_window_closed');END IF;
 v_weekday:=extract(isodow from r.slot_date)::integer;
 SELECT h.closes_min INTO v_close FROM gk2_private.opening_hours h
 WHERE h.resource='hyzr' AND h.weekday=v_weekday AND h.active=true;
 IF v_close IS NULL OR r.end_min+p_extra_minutes>v_close OR
    r.end_min+p_extra_minutes>1440
 THEN RETURN jsonb_build_object('ok',true,'available',false,'reason','outside_opening_hours','paymentReady',false); END IF;

 -- Check all resources capable of occupying the HYZR simulator (HYZR + whole venue).
 IF EXISTS(
   SELECT 1 FROM gk2_private.reservations b
   WHERE b.id<>r.id AND b.slot_date=r.slot_date
      AND b.resource IN ('hyzr','venue')
      AND b.start_min<r.end_min+p_extra_minutes AND b.end_min>r.end_min
      AND (b.status='confirmed' OR
        (b.status IN ('held','payment_pending') AND
        (b.hold_expires_at>now() OR EXISTS(
          SELECT 1 FROM gk2_private.checkout_variant_leases l
          WHERE l.reservation_id=b.id AND l.status<>'closed'))))
 ) OR EXISTS(
   SELECT 1 FROM gk2_private.blocks bl
   WHERE bl.active AND r.slot_date BETWEEN bl.date_from AND bl.date_to
     AND (bl.weekdays IS NULL OR v_weekday=ANY(bl.weekdays))
     AND bl.target IN ('all','hyzr')
     AND bl.start_min<r.end_min+p_extra_minutes AND bl.end_min>r.end_min
 )
 THEN RETURN jsonb_build_object('ok',true,'available',false,'reason','next_booking_or_block','paymentReady',false);END IF;
 v_needs_punchcard := r.customer_ref='punchcard';
 v_price_ore := CASE WHEN v_needs_punchcard THEN 0
    ELSE round(r.paid_ore::numeric*p_extra_minutes/(r.end_min-r.start_min))::integer END;
 RETURN jsonb_build_object(
   'ok',true,'available',true,'bookingId',r.id,
   'minutes',p_extra_minutes,'from',v_ends,
   'until',(r.slot_date::timestamp+make_interval(mins=>r.end_min+p_extra_minutes)) AT TIME ZONE 'Europe/Oslo',
   'originalMinutes',r.end_min-r.start_min,
   'originalPaidOre',r.paid_ore,
   'extensionPriceOre',v_price_ore,
   'type',CASE WHEN v_needs_punchcard THEN 'punchcard' ELSE 'paid' END,
   'punchcardMinutesToDebit',CASE WHEN v_needs_punchcard THEN p_extra_minutes ELSE 0 END,
   'pricingRule','original_actual_paid_per_minute',
   'paymentPreference',CASE WHEN v_needs_punchcard THEN 'punchcard' ELSE 'vipps_then_quickbutik' END,
   'held',false,'paymentReady',false,
   'note','Quote only. Reserve extension atomically before requesting payment.'
 );
END;$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_quote(uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_quote(uuid,integer,timestamptz) TO service_role;
