-- Captured Vipps money may only extend the exact previously locked half-hour
-- claims. Preflight starts a durable capture in-progress state; no timeout will
-- steal those slots while a capture call has uncertain outcome.
DROP INDEX IF EXISTS gk2_private.gk2_hyzr_extension_one_pending;
CREATE UNIQUE INDEX gk2_hyzr_extension_one_pending
 ON gk2_private.hyzr_extension_holds(reservation_id)
 WHERE state IN ('payment_pending','capture_started','review');

CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_claim_capture(p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE h gk2_private.hyzr_extension_holds%ROWTYPE;
 r gk2_private.reservations%ROWTYPE;
 v_claims integer;v_weekday integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reference IS NULL OR p_reference !~ '^GK2EXT-[a-f0-9-]{36}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_reference'); END IF;
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds WHERE reference=p_reference;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','extension_not_found');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(h.slot_date::text,0));
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds WHERE id=h.id FOR UPDATE;
 IF h.state='committed' THEN
    RETURN jsonb_build_object('ok',true,'alreadyCommitted',true,'reference',h.reference);
 END IF;
 IF h.state<>'payment_pending' OR h.expires_at<=now()
 THEN RETURN jsonb_build_object('ok',false,'code','payment_window_closed'); END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=h.reservation_id FOR UPDATE;
 IF NOT FOUND OR r.resource<>'hyzr' OR r.status<>'confirmed'
   OR r.verified_paid_at IS NULL OR r.end_min<>h.from_min
   OR r.slot_date<>h.slot_date OR r.paid_ore IS NULL
 THEN RETURN jsonb_build_object('ok',false,'code','booking_changed'); END IF;
 SELECT count(*) INTO v_claims FROM gk2_private.claims c
 WHERE c.physical_resource='hyzr' AND c.slot_date=h.slot_date
   AND c.reservation_id=h.reservation_id
   AND c.slot_min>=h.from_min AND c.slot_min<h.until_min;
 IF v_claims<>h.minutes/30
 THEN RETURN jsonb_build_object('ok',false,'code','extension_claims_missing');END IF;
 v_weekday:=extract(isodow from h.slot_date)::integer;
 IF EXISTS(SELECT 1 FROM gk2_private.blocks b
   WHERE b.active AND h.slot_date BETWEEN b.date_from AND b.date_to
     AND (b.weekdays IS NULL OR array_length(b.weekdays,1) IS NULL OR v_weekday=ANY(b.weekdays))
     AND b.target IN ('all','hyzr') AND b.start_min<h.until_min AND b.end_min>h.from_min)
 THEN RETURN jsonb_build_object('ok',false,'code','new_block');END IF;
 UPDATE gk2_private.hyzr_extension_holds
 SET state='capture_started',capture_started_at=now(),updated_at=now()
 WHERE id=h.id;
 RETURN jsonb_build_object('ok',true,'claimed',true,'holdId',h.id,
    'reservationId',h.reservation_id,'reference',h.reference,
    'amountOre',h.amount_ore,'minutes',h.minutes,
    'expiresAt',h.expires_at);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_claim_capture(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_claim_capture(text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_extension_commit_captured(
 p_reference text,p_amount_ore integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE
 h gk2_private.hyzr_extension_holds%ROWTYPE;
 r gk2_private.reservations%ROWTYPE;
 v_claims integer;
 v_paid integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reference IS NULL OR p_reference !~ '^GK2EXT-[a-f0-9-]{36}$'
   OR p_amount_ore IS NULL OR p_amount_ore<100
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_capture_proof');END IF;
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds WHERE reference=p_reference;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','extension_not_found');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(h.slot_date::text,0));
 SELECT * INTO h FROM gk2_private.hyzr_extension_holds WHERE id=h.id FOR UPDATE;
 IF h.amount_ore<>p_amount_ore
 THEN RETURN jsonb_build_object('ok',false,'code','captured_amount_mismatch'); END IF;
 IF h.state='committed' THEN
  RETURN jsonb_build_object('ok',true,'duplicate',true,'reservationId',h.reservation_id,
   'newEndMin',h.until_min,'paidOre',h.amount_ore);END IF;
 IF h.state NOT IN ('capture_started','review')
 THEN RETURN jsonb_build_object('ok',false,'code','capture_not_started');END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=h.reservation_id FOR UPDATE;
 SELECT count(*) INTO v_claims FROM gk2_private.claims c
 WHERE c.physical_resource='hyzr' AND c.slot_date=h.slot_date
   AND c.reservation_id=h.reservation_id
   AND c.slot_min>=h.from_min AND c.slot_min<h.until_min;
 IF NOT FOUND OR r.status<>'confirmed' OR r.resource<>'hyzr'
    OR r.slot_date<>h.slot_date OR r.end_min<>h.from_min
    OR r.verified_paid_at IS NULL OR r.paid_ore IS NULL
    OR v_claims<>h.minutes/30
 THEN
   UPDATE gk2_private.hyzr_extension_holds SET state='review',updated_at=now()
   WHERE id=h.id;
   RETURN jsonb_build_object('ok',false,'code','paid_requires_manual_allocation');
 END IF;
 IF r.paid_ore+h.amount_ore>100000000
 THEN RETURN jsonb_build_object('ok',false,'code','booking_price_limit');END IF;
 INSERT INTO gk2_private.payment_events(source,event_id,reservation_id)
 VALUES('vipps_hyzr_extension',h.reference,h.reservation_id) ON CONFLICT DO NOTHING;
 UPDATE gk2_private.reservations
 SET end_min=h.until_min,paid_ore=paid_ore+h.amount_ore,updated_at=now()
 WHERE id=r.id RETURNING paid_ore INTO v_paid;
 UPDATE gk2_private.hyzr_extension_holds
 SET state='committed',captured_at=now(),committed_at=now(),updated_at=now()
 WHERE id=h.id;
 RETURN jsonb_build_object('ok',true,'duplicate',false,'reservationId',r.id,
   'addedMinutes',h.minutes,'amountOre',h.amount_ore,
   'newEndMin',h.until_min,'totalPaidOre',v_paid);
END
$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_extension_commit_captured(text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_extension_commit_captured(text,integer)
 TO service_role;
