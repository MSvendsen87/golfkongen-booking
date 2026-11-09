-- Share expired extension claim cleanup with ordinary Booking 2.0 checkouts.
-- Extension quotes use the original ACTUAL paid rate, frozen before first attempt.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_quote(p_reservation uuid, p_extra_minutes integer, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE r gk2_private.reservations%ROWTYPE;
 v_now timestamptz:=coalesce(p_at,now());
 v_starts timestamptz;v_ends timestamptz;
 v_weekday integer;v_close integer;v_price_ore integer;
 v_needs_punchcard boolean;
 v_rate_paid integer;v_rate_minutes integer;
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
 IF EXISTS(SELECT 1 FROM gk2_private.hyzr_extension_holds x
   WHERE x.reservation_id=r.id AND x.state IN ('payment_pending','capture_started','review'))
 THEN RETURN jsonb_build_object('ok',true,'available',false,'reason','extension_in_progress','paymentReady',false); END IF;
 SELECT b.original_paid_ore,b.original_minutes INTO v_rate_paid,v_rate_minutes
 FROM gk2_private.hyzr_extension_rate_basis b WHERE b.reservation_id=r.id;
 v_rate_paid:=coalesce(v_rate_paid,r.paid_ore);
 v_rate_minutes:=coalesce(v_rate_minutes,r.end_min-r.start_min);
 v_needs_punchcard := r.customer_ref='punchcard';
 v_price_ore := CASE WHEN v_needs_punchcard THEN 0
    ELSE round(v_rate_paid::numeric*p_extra_minutes/v_rate_minutes)::integer END;
 RETURN jsonb_build_object(
   'ok',true,'available',true,'bookingId',r.id,
   'minutes',p_extra_minutes,'from',v_ends,
   'until',(r.slot_date::timestamp+make_interval(mins=>r.end_min+p_extra_minutes)) AT TIME ZONE 'Europe/Oslo',
   'originalMinutes',v_rate_minutes,
   'originalPaidOre',v_rate_paid,
   'extensionPriceOre',v_price_ore,
   'type',CASE WHEN v_needs_punchcard THEN 'punchcard' ELSE 'paid' END,
   'punchcardMinutesToDebit',CASE WHEN v_needs_punchcard THEN p_extra_minutes ELSE 0 END,
   'pricingRule','original_actual_paid_per_minute',
   'paymentPreference',CASE WHEN v_needs_punchcard THEN 'punchcard' ELSE 'vipps_then_quickbutik' END,
   'held',false,'paymentReady',false,
   'note','Quote only. Reserve extension atomically before requesting payment.'
 );
END;$function$
;
CREATE OR REPLACE FUNCTION public.gk2_hold_slot(p_key uuid, p_day date, p_resource text, p_start integer, p_duration integer, p_terms text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid;v_end integer;v_exp timestamptz:=now()+interval '10 minutes';
 v_existing gk2_private.reservations%ROWTYPE;v_resources text[];v_code text;v_slot integer;
 v_weekday integer;v_today date;v_mins integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM gk2_private.release_gates WHERE singleton
    AND legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
    AND checkout_paid_webhook_verified AND pushover_end_to_end_verified
    AND admin_auth_verified AND concurrency_verified AND legacy_cron_switch_verified)
 THEN RAISE EXCEPTION 'gk2_launch_locked';END IF;
 IF p_key IS NULL OR p_day IS NULL OR p_resource IS NULL OR p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
   OR p_start IS NULL OR p_duration IS NULL OR p_terms IS NULL OR p_terms NOT LIKE 'gk-v%' THEN RAISE EXCEPTION 'bad_request'; END IF;
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
 -- Release only expired, still-unpaid HYZR extension claims while holding the
 -- same day lock. Captures already started must NEVER be released here.
 PERFORM public.gk2_hyzr_extension_cleanup(p_day);
 SELECT * INTO v_existing FROM gk2_private.reservations WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
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
 IF p_resource IN ('hyzr','dart_a','dart_b','venue') AND p_start<1320 AND v_end>1140
 AND EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND (ce.hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=ce.id AND cl.lease_state<>'closed'))))) THEN RAISE EXCEPTION 'club_already_reserved'; END IF;
 INSERT INTO gk2_private.reservations(idempotency_key,slot_date,resource,start_min,end_min,status,hold_expires_at,terms_version)
 VALUES(p_key,p_day,p_resource,p_start,v_end,'held',v_exp,p_terms) RETURNING id INTO v_id;
 FOREACH v_code IN ARRAY v_resources LOOP
  FOR v_slot IN SELECT generate_series(p_start,v_end-30,30) LOOP
   INSERT INTO gk2_private.claims(physical_resource,slot_date,slot_min,reservation_id)
   VALUES(v_code,p_day,v_slot,v_id);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('id',v_id,'status','held','hold_expires_at',v_exp);
END; $function$
;
