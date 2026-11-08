-- HYZR 10min grace; any later paid/held booking begins at its exact start, overriding grace.
-- Code is read-only and administrator controlled; no PC actions or payments.
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
  v_closing integer;
  v_extension_possible boolean := false;
  v_current timestamptz := coalesce(p_at, now());
BEGIN
  IF current_user IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_at IS NULL OR p_at < now() - interval '90 days' OR p_at > now() + interval '45 days' THEN
    RAISE EXCEPTION 'timestamp_out_of_bounds';
  END IF;

  SELECT r.id,r.slot_date,r.resource,r.start_min,r.end_min,
    (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' AS starts_at,
    (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' AS ends_at
  INTO v_book
  FROM gk2_private.reservations r
  WHERE r.resource IN ('hyzr','venue')
    AND r.status='confirmed'
    AND r.verified_paid_at IS NOT NULL
    AND r.paid_ore IS NOT NULL
    AND (
       (r.slot_date::timestamp + make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo' <= v_current
       AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' > v_current
       OR
       (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' <= v_current
       AND (r.slot_date::timestamp + make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo' + interval '10 minutes' > v_current
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

  v_lock := LEAST(v_book.ends_at + interval '10 minutes',coalesce(v_next,'infinity'::timestamptz));
  IF v_current>=v_lock THEN
    RETURN jsonb_build_object('ok',true,'state','locked','reason','booking_finished','extensionPossible',false);
  END IF;

  IF v_book.resource='hyzr' AND v_current < v_lock THEN
    SELECT h.closes_min INTO v_closing FROM gk2_private.opening_hours h
    WHERE h.resource='hyzr' AND h.weekday=extract(isodow from v_book.slot_date)::integer AND h.active;
    v_extension_possible := v_closing IS NOT NULL
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
    'state',CASE WHEN v_current>=v_book.ends_at THEN 'grace'
       WHEN v_current>=v_book.ends_at-interval '4 minutes' THEN 'warning'
       ELSE 'active' END,
    'bookingId',v_book.id,
    'resource',v_book.resource,
    'startsAt',v_book.starts_at,
    'endsAt',v_book.ends_at,
    'lockAt',v_lock,
    'remainingSeconds',greatest(0,ceil(extract(epoch FROM v_book.ends_at-v_current))::integer),
    'extensionPossible',v_extension_possible,
    'extensionPaymentReady',false
  );
END;
$function$

REVOKE ALL ON FUNCTION public.gk2_hyzr_preview_state(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_preview_state(timestamptz) TO service_role;
