-- STAGING: Cancelled Quickbutik orders revoke Nuki BEFORE freeing the slot.
BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_cancel_verified_paid_order(p_order text)
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE r gk2_private.reservations%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$' THEN
 RAISE EXCEPTION 'invalid_cancelled_order';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE quickbutik_order_id=p_order;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=r.id FOR UPDATE;
 IF r.status IN ('cancelled','refunded') THEN
 RETURN jsonb_build_object('found',true,'alreadyCancelled',true,'id',r.id);END IF;
 IF r.status<>'confirmed' OR r.verified_paid_at IS NULL THEN
 RETURN jsonb_build_object('found',true,'status','manual_review');END IF;
 UPDATE gk2_private.reservations SET status='cancelled',updated_at=now() WHERE id=r.id;
 UPDATE gk2_private.booking_access_codes SET status='cancel_requested',updated_at=now()
 WHERE reservation_id=r.id AND status NOT IN ('revoked','revoking');
 INSERT INTO gk2_private.notification_outbox(reservation_id,kind)
 VALUES(r.id,'booking_cancelled') ON CONFLICT DO NOTHING;
 -- Intentionally retain calendar claims until Nuki has confirmed removal.
 RETURN jsonb_build_object('found',true,'queuedRevocation',true,'id',r.id);
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_get_existing_nuki_access(p_reservation uuid)
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE a gk2_private.booking_access_codes%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO a FROM gk2_private.booking_access_codes
 WHERE reservation_id=p_reservation;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('name',a.authorization_name,'ciphertext',a.encrypted_code,
 'lockId',a.lock_id,'status',a.status,'authId',a.nuki_authorization_id);
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_finish_revoked_booking(p_reservation uuid)
RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE r gk2_private.reservations%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.slot_date::text,0));
 SELECT * INTO r FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;
 IF r.status NOT IN ('cancelled','refunded') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.booking_access_codes a
 WHERE a.reservation_id=r.id AND a.status<>'revoked') THEN RETURN false; END IF;
 DELETE FROM gk2_private.claims WHERE reservation_id=r.id;
 RETURN true;
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_claim_confirmed_notification()
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE e record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT o.id AS event_id,o.kind,o.reservation_id,
 r.quickbutik_order_id,r.customer_email,r.slot_date,r.resource,r.start_min,r.end_min,
 r.rental_sets_count,r.verified_paid_at,l.quickbutik_product_id
 INTO e
 FROM gk2_private.notification_outbox o
 JOIN gk2_private.reservations r ON r.id=o.reservation_id
 JOIN gk2_private.checkout_product_plans l
 ON l.resource=r.resource AND l.duration_minutes=r.end_min-r.start_min
 WHERE o.status='pending' AND o.next_attempt_at<=now()
 AND o.kind IN ('booking_confirmed','nuki_access_requested','booking_cancelled')
 AND (
   (o.kind IN ('booking_confirmed','nuki_access_requested') AND r.status='confirmed')
   OR (o.kind='booking_cancelled' AND r.status IN ('cancelled','refunded'))
 )
 AND r.verified_paid_at IS NOT NULL
 AND r.quickbutik_order_id IS NOT NULL AND r.customer_email IS NOT NULL
 ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE gk2_private.notification_outbox
 SET status='sending',attempts=attempts+1,last_attempt_at=now(),last_error=NULL
 WHERE id=e.event_id;
 RETURN jsonb_build_object('eventId',e.event_id,'kind',e.kind,
 'bookingId',e.reservation_id,'orderId',e.quickbutik_order_id,
 'email',e.customer_email,'day',e.slot_date,'resource',e.resource,
 'startMin',e.start_min,'endMin',e.end_min,'rentalSets',e.rental_sets_count,
 'productId',e.quickbutik_product_id);
END;$f$;
REVOKE ALL ON FUNCTION public.gk2_cancel_verified_paid_order(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_get_existing_nuki_access(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_finish_revoked_booking(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_claim_confirmed_notification() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_cancel_verified_paid_order(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_get_existing_nuki_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_finish_revoked_booking(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_claim_confirmed_notification() TO service_role;
COMMIT;