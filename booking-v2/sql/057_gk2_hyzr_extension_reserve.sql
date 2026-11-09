-- Lock/cleanup must be in Booking 2.0's existing per-date advisory-lock
-- critical section. This operation does NOT change paid customer bookings.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_cleanup(p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE h gk2_private.hyzr_extension_holds%ROWTYPE;v_count integer:=0;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_day IS NULL THEN RAISE EXCEPTION 'invalid_date';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 FOR h IN SELECT * FROM gk2_private.hyzr_extension_holds
 WHERE slot_date=p_day AND state='payment_pending' AND expires_at<=now()
 ORDER BY created_at,id FOR UPDATE
 LOOP
   -- Only extension half-hour claims; never delete the customer's original time.
   DELETE FROM gk2_private.claims c
   WHERE c.reservation_id=h.reservation_id AND c.slot_date=h.slot_date
     AND c.physical_resource='hyzr' AND c.slot_min>=h.from_min AND c.slot_min<h.until_min;
   UPDATE gk2_private.hyzr_extension_holds SET state='expired',updated_at=now() WHERE id=h.id;
   v_count:=v_count+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'expired',v_count);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_cleanup(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_cleanup(date) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_reserve(
 p_request uuid,p_reservation uuid,p_extra_minutes integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE
 r gk2_private.reservations%ROWTYPE;
 b gk2_private.hyzr_extension_rate_basis%ROWTYPE;
 old_hold gk2_private.hyzr_extension_holds%ROWTYPE;
 v_start timestamptz;v_end timestamptz;v_end_new timestamptz;
 v_now timestamptz:=now();v_exp timestamptz;
 v_close integer;v_dow integer;v_price integer;v_ref text;
 v_id uuid;v_slot integer;v_busy boolean;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_request IS NULL OR p_reservation IS NULL OR p_extra_minutes IS NULL
    OR p_extra_minutes NOT IN (30,60,90,120)
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_extension');END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','booking_not_found');END IF;
 -- Same lock that gk2_hold_slot takes before adding physical claims.
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 SELECT * INTO old_hold FROM gk2_private.hyzr_extension_holds WHERE request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF old_hold.reservation_id<>p_reservation OR old_hold.minutes<>p_extra_minutes
  THEN RETURN jsonb_build_object('ok',false,'code','idempotency_key_conflict');END IF;
  RETURN jsonb_build_object('ok',true,'duplicate',true,'state',old_hold.state,
    'reference',old_hold.reference,'holdId',old_hold.id,
    'priceOre',old_hold.amount_ore,'expiresAt',old_hold.expires_at);
 END IF;
 PERFORM public.gk2_hyzr_extension_cleanup(r.slot_date);
 IF r.status<>'confirmed' OR r.resource<>'hyzr' OR r.verified_paid_at IS NULL
    OR r.paid_ore IS NULL OR r.paid_ore<100 OR r.customer_ref='punchcard'
 THEN RETURN jsonb_build_object('ok',false,'code','not_eligible_paid_hyzr');END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.hyzr_extension_holds h
   WHERE h.reservation_id=r.id AND h.state IN ('payment_pending','capture_started'))
 THEN RETURN jsonb_build_object('ok',false,'code','extension_already_in_progress');END IF;
 v_start:=(r.slot_date::timestamp+make_interval(mins=>r.start_min)) AT TIME ZONE 'Europe/Oslo';
 v_end:=(r.slot_date::timestamp+make_interval(mins=>r.end_min)) AT TIME ZONE 'Europe/Oslo';
 v_end_new:=(r.slot_date::timestamp+make_interval(mins=>r.end_min+p_extra_minutes)) AT TIME ZONE 'Europe/Oslo';
 -- Never start payment before booking begins, after customer grace, or after
 -- this slot was already superseded by a subsequent booking.
 IF v_now<v_start OR v_now>=v_end+interval '10 minutes'
 THEN RETURN jsonb_build_object('ok',false,'code','extension_window_closed');END IF;
 v_exp:=LEAST(v_now+interval '10 minutes',v_end+interval '10 minutes');
 IF v_exp<=v_now+interval '60 seconds'
 THEN RETURN jsonb_build_object('ok',false,'code','not_enough_payment_time');END IF;
 v_dow:=extract(isodow from r.slot_date)::integer;
 SELECT h.closes_min INTO v_close FROM gk2_private.opening_hours h
 WHERE h.resource='hyzr' AND h.weekday=v_dow AND h.active=true;
 IF v_close IS NULL OR r.end_min+p_extra_minutes>v_close OR r.end_min+p_extra_minutes>1440
 THEN RETURN jsonb_build_object('ok',false,'code','closed_hours');END IF;
 IF EXISTS (
  SELECT 1 FROM gk2_private.blocks x
  WHERE x.active AND r.slot_date BETWEEN x.date_from AND x.date_to
  AND (x.weekdays IS NULL OR array_length(x.weekdays,1) IS NULL OR v_dow=ANY(x.weekdays))
  AND x.target IN ('all','hyzr')
  AND x.start_min<r.end_min+p_extra_minutes AND x.end_min>r.end_min
 ) THEN RETURN jsonb_build_object('ok',false,'code','blocked_time');END IF;
 IF EXISTS (
  SELECT 1 FROM gk2_private.reservations o
  WHERE o.id<>r.id AND o.slot_date=r.slot_date AND o.resource IN ('hyzr','venue')
    AND o.start_min<r.end_min+p_extra_minutes AND o.end_min>r.end_min
    AND (o.status='confirmed' OR
     (o.status IN ('held','payment_pending') AND
      (o.hold_expires_at>v_now OR EXISTS(
       SELECT 1 FROM gk2_private.checkout_variant_leases l
       WHERE l.reservation_id=o.id AND l.status<>'closed'))))
 ) THEN RETURN jsonb_build_object('ok',false,'code','next_booking');END IF;
 -- Club evening occupies HYZR too, even when the club has only seat holds.
 IF r.end_min<1320 AND r.end_min+p_extra_minutes>1140 AND EXISTS (
  SELECT 1 FROM gk2_private.club_enrolments ce
  WHERE ce.slot_date=r.slot_date
    AND (ce.status='confirmed' OR
       (ce.status IN ('held','payment_pending') AND
          (ce.hold_expires_at>v_now OR EXISTS(
           SELECT 1 FROM gk2_private.club_checkout_leases cl
           WHERE cl.enrolment_id=ce.id AND cl.lease_state<>'closed'))))
 ) THEN RETURN jsonb_build_object('ok',false,'code','club_evening');END IF;
 IF EXISTS(
   SELECT 1 FROM gk2_private.claims c
   WHERE c.slot_date=r.slot_date AND c.physical_resource='hyzr'
   AND c.slot_min>=r.end_min AND c.slot_min<r.end_min+p_extra_minutes
 ) THEN RETURN jsonb_build_object('ok',false,'code','occupied_claim');END IF;
 INSERT INTO gk2_private.hyzr_extension_rate_basis(reservation_id,original_paid_ore,original_minutes)
 VALUES(r.id,r.paid_ore,r.end_min-r.start_min) ON CONFLICT (reservation_id) DO NOTHING;
 SELECT * INTO b FROM gk2_private.hyzr_extension_rate_basis WHERE reservation_id=r.id;
 IF b.original_minutes<30 OR b.original_paid_ore<100
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_price_basis');END IF;
 v_price:=round(b.original_paid_ore::numeric*p_extra_minutes/b.original_minutes)::integer;
 IF v_price<100 OR v_price>100000000
 THEN RETURN jsonb_build_object('ok',false,'code','price_not_supported');END IF;
 v_ref:='GK2EXT-'||gen_random_uuid()::text;
 INSERT INTO gk2_private.hyzr_extension_holds
  (request_id,reservation_id,slot_date,from_min,until_min,minutes,
   amount_ore,reference,expires_at)
 VALUES(p_request,r.id,r.slot_date,r.end_min,r.end_min+p_extra_minutes,p_extra_minutes,
  v_price,v_ref,v_exp)
 RETURNING id INTO v_id;
 -- Claim the EXACT physical slots used by the normal booking engine.
 FOR v_slot IN SELECT generate_series(r.end_min,r.end_min+p_extra_minutes-30,30) LOOP
   INSERT INTO gk2_private.claims(physical_resource,slot_date,slot_min,reservation_id)
   VALUES('hyzr',r.slot_date,v_slot,r.id);
 END LOOP;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'state','payment_pending',
    'holdId',v_id,'reference',v_ref,'reservationId',r.id,
    'minutes',p_extra_minutes,'priceOre',v_price,
    'from',v_end,'until',v_end_new,'expiresAt',v_exp,
    'paymentReady',false);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_reserve(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_reserve(uuid,uuid,integer) TO service_role;
