-- HYZR preview: never give grace or employee override beyond opening hours.
-- Tested against synthetic future bookings in a transaction with ROLLBACK.
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
  -- Hard physical closing cap at 22:00 independent of configuration.
  v_safe_close:=LEAST(v_safe_close,1320);
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
