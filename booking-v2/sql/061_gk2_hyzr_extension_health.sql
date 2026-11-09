-- Read-only admin safety dashboard for HYZR extension payment rollout.
-- Service role only. Includes no customer names or contact details.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_health()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Oslo')::date;
  v_unpriced int;
  v_pending int;
  v_overdue int;
  v_capturing int;
  v_capture_stale int;
  v_review int;
  v_committed int;
  v_expired int;
  v_total integer;
BEGIN
  IF current_user IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO v_unpriced
  FROM gk2_private.reservations r
  WHERE r.resource='hyzr' AND r.status='confirmed'
   AND r.verified_paid_at IS NOT NULL
   AND r.customer_ref IS DISTINCT FROM 'punchcard'
   AND r.paid_ore IS NULL
   AND r.slot_date BETWEEN v_today AND (v_today+45);

  SELECT
    count(*)::int,
    count(*) FILTER(WHERE state='payment_pending')::int,
    count(*) FILTER(WHERE state='payment_pending' AND expires_at<=now())::int,
    count(*) FILTER(WHERE state='capture_started')::int,
    count(*) FILTER(WHERE state='capture_started' AND capture_started_at<now()-interval '5 minutes')::int,
    count(*) FILTER(WHERE state='review')::int,
    count(*) FILTER(WHERE state='committed')::int,
    count(*) FILTER(WHERE state='expired')::int
  INTO v_total,v_pending,v_overdue,v_capturing,v_capture_stale,v_review,v_committed,v_expired
  FROM gk2_private.hyzr_extension_holds;

  RETURN jsonb_build_object(
    'ok',true,
    'checkedAt',now(),
    'mode','READONLY_ADMIN_HEALTH',
    'bookingsMissingVerifiedNetAmount',v_unpriced,
    'extensionHoldsTotal',v_total,
    'pendingPayment',v_pending,
    'pendingPaymentExpired',v_overdue,
    'captureInProgress',v_capturing,
    'captureInProgressOverFiveMinutes',v_capture_stale,
    'manualPaymentReview',v_review,
    'completedExtensions',v_committed,
    'expiredHolds',v_expired,
    'requiresAttention',v_unpriced>0 OR v_overdue>0 OR v_capture_stale>0 OR v_review>0
  );
END $fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_health() TO service_role;
