DO $migration$
DECLARE v_ready integer; v_changed integer;
BEGIN
 LOCK TABLE gk2_private.opening_hours IN SHARE ROW EXCLUSIVE MODE;
 SELECT count(*) INTO v_ready
 FROM gk2_private.checkout_product_plans p
 JOIN gk2_private.calendar_sync_state c ON c.product_id=p.quickbutik_product_id
 CROSS JOIN gk2_private.booking_settings s
 CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE 'Europe/Oslo')::date AS today) d
 WHERE s.singleton AND p.publish_enabled AND p.is_ready
   AND c.last_result->>'complete'='true'
   AND c.last_result->>'standardOpen'='480'
   AND c.last_result->>'standardClose'='1380'
   AND c.last_result->>'remaining'='0'
   AND (c.last_result->>'firstDay')::date<=d.today
   AND (c.last_result->>'targetDay')::date>=d.today+s.horizon_days+1
   AND (c.last_result->>'expected')::int=
      (((1380-480-p.duration_minutes)/30)+1) *
      ((c.last_result->>'targetDay')::date-(c.last_result->>'firstDay')::date+1);
 IF v_ready<>33 THEN RAISE EXCEPTION 'Expected 33 verified checkout products, got %',v_ready; END IF;
 UPDATE gk2_private.opening_hours
SET opens_min=480, closes_min=1380
WHERE resource IN ('hyzr','dart_a','dart_b','venue')
 AND weekday BETWEEN 1 AND 7
 AND active AND opens_min=600 AND closes_min=1320
 AND (SELECT count(*) FROM gk2_private.opening_hours
       WHERE resource IN ('hyzr','dart_a','dart_b','venue') AND weekday BETWEEN 1 AND 7
       AND active AND opens_min=600 AND closes_min=1320)=28;
 GET DIAGNOSTICS v_changed = ROW_COUNT;
 IF v_changed<>28 THEN RAISE EXCEPTION 'Expected 28 opening-hour updates, got %',v_changed; END IF;
 INSERT INTO gk2_private.audit_events(actor,action,payload)
 VALUES('booking-operations','opening_hours_changed',
  jsonb_build_object('resources',jsonb_build_array('hyzr','dart_a','dart_b','venue'),
                     'weekdays',jsonb_build_array(1,2,3,4,5,6,7),'opens',480,'closes',1380));
END
$migration$;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_early_access_state(p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE
  v_book RECORD;
  v_start timestamptz;
  v_end timestamptz;
  v_lock timestamptz;
  v_close_at timestamptz;
  v_next timestamptz;
  v_block_start timestamptz;
  v_open_min int;
  v_close_min int;
  v_now timestamptz := coalesce(p_at,now());
  v_weekday int;
BEGIN
  IF current_user IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_at IS NULL OR p_at < now()-interval '90 days' OR p_at > now()+interval '45 days' THEN
    RAISE EXCEPTION 'invalid_timestamp';
  END IF;
  -- No free minutes are added to the paid reservation. This is only early PC access.
  SELECT r.id,r.resource,r.slot_date,r.start_min,r.end_min,
     (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' AS starts_at,
     (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' AS ends_at
  INTO v_book
  FROM gk2_private.reservations r
  WHERE r.resource IN ('hyzr','venue')
    AND r.status='confirmed'
    AND r.verified_paid_at IS NOT NULL
    AND (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' > v_now
    AND (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' <= v_now+interval '5 minutes'
  ORDER BY starts_at,id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','outside_early_access_window');
  END IF;
  v_start:=v_book.starts_at; v_end:=v_book.ends_at;
  v_weekday:=extract(isodow from v_book.slot_date)::int;
  IF v_end<=v_start OR v_end>v_now+interval '24 hours' THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','invalid_reservation_deadline');
  END IF;

  -- An existing session (including its ten-minute grace), venue booking,
  -- held checkout or pending payment must never be displaced by early access.
  IF EXISTS(
    SELECT 1 FROM gk2_private.reservations r
    WHERE r.id<>v_book.id AND r.resource IN ('hyzr','venue')
      AND (r.status='confirmed'
        OR (r.status IN ('held','payment_pending')
          AND (r.hold_expires_at>v_now OR EXISTS (
            SELECT 1 FROM gk2_private.checkout_variant_leases l
            WHERE l.reservation_id=r.id AND l.status<>'closed'
          ))))
      AND (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' < v_start
      AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_now-interval '10 minutes'
  ) THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','previous_session_or_hold');
  END IF;
  -- Reject any other session overlapping the actual booked time as well.
  IF EXISTS(
    SELECT 1 FROM gk2_private.reservations r
    WHERE r.id<>v_book.id AND r.resource IN ('hyzr','venue')
      AND (r.status='confirmed'
        OR (r.status IN ('held','payment_pending')
          AND (r.hold_expires_at>v_now OR EXISTS (
            SELECT 1 FROM gk2_private.checkout_variant_leases l
            WHERE l.reservation_id=r.id AND l.status<>'closed'
          ))))
      AND (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' < v_end
      AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_start
  ) THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','overlapping_booking');
  END IF;
  -- Opening hours must cover the booked session; early access may start five
  -- minutes before opening when the first slot begins at opening.
  SELECT max(h.opens_min),min(h.closes_min) INTO v_open_min,v_close_min
  FROM gk2_private.opening_hours h
  WHERE h.resource IN ('hyzr',v_book.resource)
    AND h.weekday=v_weekday AND h.active=true;
  IF v_open_min IS NULL OR v_close_min IS NULL
    OR v_book.start_min<v_open_min OR v_book.end_min>least(v_close_min,1380)
  THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','opening_hours_unavailable');
  END IF;
  v_close_at:=(v_book.slot_date::timestamp +
      make_interval(mins=>least(v_close_min,1380))) AT TIME ZONE 'Europe/Oslo';

  IF EXISTS(
    SELECT 1 FROM gk2_private.blocks bl
    WHERE bl.active AND v_book.slot_date BETWEEN bl.date_from AND bl.date_to
      AND (bl.weekdays IS NULL OR v_weekday=ANY(bl.weekdays))
      AND bl.target IN ('all','hyzr')
      AND (v_book.slot_date::timestamp+make_interval(mins=>bl.start_min)) AT TIME ZONE 'Europe/Oslo' < v_end
      AND (v_book.slot_date::timestamp+make_interval(mins=>bl.end_min)) AT TIME ZONE 'Europe/Oslo' > v_now
  ) THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','admin_block');
  END IF;

  -- Identical post-booking cutoffs as the normal HYZR controller.
  SELECT min((r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo')
  INTO v_next
  FROM gk2_private.reservations r
  WHERE r.id<>v_book.id AND r.resource IN ('hyzr','venue')
    AND (r.status='confirmed' OR
       (r.status IN ('held','payment_pending') AND
       (r.hold_expires_at>v_now OR EXISTS(
         SELECT 1 FROM gk2_private.checkout_variant_leases l
         WHERE l.reservation_id=r.id AND l.status<>'closed'
       ))))
    AND (r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' >= v_end;
  SELECT min((v_book.slot_date::timestamp+make_interval(mins=>bl.start_min)) AT TIME ZONE 'Europe/Oslo')
  INTO v_block_start
  FROM gk2_private.blocks bl
  WHERE bl.active AND v_book.slot_date BETWEEN bl.date_from AND bl.date_to
    AND (bl.weekdays IS NULL OR v_weekday=ANY(bl.weekdays))
    AND bl.target IN ('all','hyzr')
    AND (v_book.slot_date::timestamp+make_interval(mins=>bl.start_min)) AT TIME ZONE 'Europe/Oslo' >= v_end;
  v_lock:=least(v_end+interval '10 minutes',
    coalesce(v_next,'infinity'::timestamptz),
    coalesce(v_block_start,'infinity'::timestamptz),v_close_at);
  IF v_lock<=v_start THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','invalid_early_access_deadline');
  END IF;
  RETURN jsonb_build_object(
    'ok',true,'state','early',
    'bookingId',v_book.id,'resource',v_book.resource,
    'staffMode',false,'startsAt',v_start,'endsAt',v_end,'lockAt',v_lock,
    'remainingSeconds',greatest(0,ceil(extract(epoch from v_end-v_now))::int),
    'extensionPossible',false,'extensionPaymentReady',false,
    'earlyAccessMinutes',5
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_preview_state(p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE
  v_book record;
  v_overlap integer;
  v_next timestamptz;
  v_lock timestamptz;
  v_staff_until timestamptz;
  v_staff_mode boolean := false;
  v_block_start timestamptz;
  v_closing integer;
  v_safe_close integer;
  v_safe_close_at timestamptz;
  v_extension_possible boolean := false;
  v_current timestamptz := coalesce(p_at, now());
BEGIN
  IF current_user IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_at IS NULL OR p_at < now() - interval '90 days' OR p_at > now() + interval '45 days' THEN
    RAISE EXCEPTION 'timestamp_out_of_bounds';
  END IF;

  SELECT r.id,r.slot_date,r.resource,r.customer_email,r.paid_ore,r.start_min,r.end_min,
    (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' AS starts_at,
    (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' AS ends_at
  INTO v_book
  FROM gk2_private.reservations r
  WHERE r.resource IN ('hyzr','venue')
    AND r.status='confirmed'
    AND r.verified_paid_at IS NOT NULL
    -- Paid status has been verified by the Quickbutik payment verifier.
    -- Quickbutik V1 may not expose a defensible net amount (paid_ore can be NULL).
    AND (
       (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' <= v_current
       AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_current
       OR
       (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' <= v_current
       AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' + interval '10 minutes' > v_current
       OR
       (r.resource='hyzr' AND EXISTS(
         SELECT 1 FROM gk2_private.hyzr_staff_overrides so
         JOIN gk2_private.hyzr_staff_codes sc ON sc.email=so.employee_email AND sc.active
         WHERE so.reservation_id=r.id AND so.revoked_at IS NULL
           AND so.employee_email=lower(btrim(r.customer_email))
           AND so.enabled_at<=v_current AND so.valid_until>v_current
       ))
    )
  ORDER BY
    CASE WHEN (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_current THEN 0 ELSE 1 END,
    r.end_min DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','no_paid_booking','extensionPossible',false);
  END IF;

  SELECT count(*) INTO v_overlap
  FROM gk2_private.reservations r
  WHERE r.id<>v_book.id AND r.resource IN ('hyzr','venue')
   AND (r.status='confirmed'
       OR (r.status IN ('held','payment_pending')
         AND (r.hold_expires_at>now()
           OR EXISTS(SELECT 1 FROM gk2_private.checkout_variant_leases l
                     WHERE l.reservation_id=r.id AND l.status<>'closed'))))
   AND (r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' < v_book.ends_at
   AND (r.slot_date::timestamp+make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_book.starts_at;

  IF v_overlap>0 THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','overlapping_booking','extensionPossible',false);
  END IF;

  SELECT min((r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo')
    INTO v_next
  FROM gk2_private.reservations r
  WHERE r.id<>v_book.id AND r.resource IN ('hyzr','venue')
   AND (r.status='confirmed'
       OR (r.status IN ('held','payment_pending')
         AND (r.hold_expires_at>now()
           OR EXISTS(SELECT 1 FROM gk2_private.checkout_variant_leases l
                     WHERE l.reservation_id=r.id AND l.status<>'closed'))))
   AND (r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' >= v_book.ends_at;

  SELECT so.valid_until INTO v_staff_until
  FROM gk2_private.hyzr_staff_overrides so
  JOIN gk2_private.hyzr_staff_codes sc ON sc.email=so.employee_email AND sc.active
  WHERE so.reservation_id=v_book.id AND v_book.resource='hyzr'
    AND so.employee_email=lower(btrim(v_book.customer_email))
    AND so.revoked_at IS NULL AND so.enabled_at<=v_current AND so.valid_until>v_current;
  v_staff_mode:=v_staff_until IS NOT NULL;

  -- Both a regular booking's 10-minute grace and an employee bypass
  -- must end no later than the local closing time of the HYZR device.
  -- Whole-venue bookings are subject to BOTH venue and simulator hours.
  SELECT min(h.closes_min) INTO v_safe_close
  FROM gk2_private.opening_hours h
  WHERE h.resource IN ('hyzr',v_book.resource)
    AND h.weekday=extract(isodow from v_book.slot_date)::integer
    AND h.active=true;
  IF v_safe_close IS NULL THEN
    RETURN jsonb_build_object('ok',true,'state','locked',
      'reason','opening_hours_unavailable','extensionPossible',false);
  END IF;
  -- Hard physical closing cap at 23:00 independent of configuration.
  v_safe_close:=LEAST(v_safe_close,1380);
  v_safe_close_at:=(v_book.slot_date::timestamp+
    make_interval(mins=>v_safe_close)) AT TIME ZONE 'Europe/Oslo';

  -- An administrator block is as important as the next customer's booking.
  SELECT min((v_book.slot_date::timestamp+make_interval(mins=>bl.start_min)) AT TIME ZONE 'Europe/Oslo')
  INTO v_block_start FROM gk2_private.blocks bl
  WHERE bl.active AND v_book.slot_date BETWEEN bl.date_from AND bl.date_to
    AND (bl.weekdays IS NULL OR extract(isodow from v_book.slot_date)::int=ANY(bl.weekdays))
    AND bl.target IN ('all','hyzr')
    AND (v_book.slot_date::timestamp+make_interval(mins=>bl.end_min)) AT TIME ZONE 'Europe/Oslo' > v_current
    AND (v_book.slot_date::timestamp+make_interval(mins=>bl.start_min)) AT TIME ZONE 'Europe/Oslo' >= v_book.ends_at;

  v_lock := LEAST(CASE WHEN v_staff_mode THEN v_staff_until ELSE v_book.ends_at+interval '10 minutes' END,
    coalesce(v_next,'infinity'::timestamptz),coalesce(v_block_start,'infinity'::timestamptz),
    v_safe_close_at);
  IF v_current>=v_lock THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','booking_finished','extensionPossible',false);
  END IF;

  IF v_book.resource='hyzr' AND NOT v_staff_mode AND v_current < v_lock THEN
    SELECT h.closes_min INTO v_closing FROM gk2_private.opening_hours h
    WHERE h.resource='hyzr' AND h.weekday=extract(isodow from v_book.slot_date)::integer AND h.active;
    v_extension_possible := v_book.paid_ore IS NOT NULL AND v_closing IS NOT NULL
      AND v_book.end_min+30<=v_closing
      AND (v_next IS NULL OR v_next >= v_book.ends_at+interval '30 minutes')
      AND NOT EXISTS (
         SELECT 1 FROM gk2_private.blocks bl
         WHERE bl.active AND v_book.slot_date BETWEEN bl.date_from AND bl.date_to
           AND (bl.weekdays IS NULL OR extract(isodow from v_book.slot_date)::integer = ANY(bl.weekdays))
           AND bl.start_min<v_book.end_min+30 AND bl.end_min>v_book.end_min
           AND bl.target IN ('all','hyzr')
      );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'state',CASE WHEN v_staff_mode THEN 'staff'
      WHEN v_current>=v_book.ends_at THEN 'grace'
       WHEN v_current>=v_book.ends_at-interval '4 minutes' THEN 'warning'
       ELSE 'active' END,
    'bookingId',v_book.id,
    'resource',v_book.resource,
    'staffMode',v_staff_mode,
    'startsAt',v_book.starts_at,
    'endsAt',v_book.ends_at,
    'lockAt',v_lock,
    'remainingSeconds',greatest(0,ceil(extract(epoch FROM v_book.ends_at-v_current))::integer),
    'extensionPossible',v_extension_possible,
    'extensionPaymentReady',false
  );
END;
$function$
;
