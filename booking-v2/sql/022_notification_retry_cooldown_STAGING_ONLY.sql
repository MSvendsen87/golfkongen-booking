BEGIN;
ALTER TABLE gk2_private.notification_outbox
 ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS gk2_notify_next_attempt
 ON gk2_private.notification_outbox(status,next_attempt_at);
CREATE OR REPLACE FUNCTION public.gk2_claim_confirmed_notification()
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE e record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT o.id AS event_id,o.kind,o.reservation_id,
 r.quickbutik_order_id,r.customer_email,r.slot_date,r.resource,r.start_min,r.end_min,
 r.rental_sets_count,r.status,r.verified_paid_at,
 l.quickbutik_product_id
 INTO e
 FROM gk2_private.notification_outbox o
 JOIN gk2_private.reservations r ON r.id=o.reservation_id
 JOIN gk2_private.checkout_product_plans l
 ON l.resource=r.resource AND l.duration_minutes=r.end_min-r.start_min
 WHERE o.status='pending' AND o.next_attempt_at<=now()
 AND o.kind IN ('booking_confirmed','nuki_access_requested')
 AND r.status='confirmed' AND r.verified_paid_at IS NOT NULL
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
CREATE OR REPLACE FUNCTION public.gk2_complete_confirmed_notification(
 p_event uuid,p_state text,p_external_id text DEFAULT NULL,p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE old_status text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_event IS NULL OR p_state NOT IN ('sent','pending','unknown','failed')
 THEN RAISE EXCEPTION 'invalid_outbox_completion'; END IF;
 SELECT status INTO old_status FROM gk2_private.notification_outbox WHERE id=p_event FOR UPDATE;
 IF old_status IS DISTINCT FROM 'sending' THEN RAISE EXCEPTION 'outbox_not_claimed';END IF;
 UPDATE gk2_private.notification_outbox
 SET status=p_state,sent_at=CASE WHEN p_state='sent' THEN now() ELSE sent_at END,
 next_attempt_at=CASE WHEN p_state='pending' THEN now()+interval '90 seconds' ELSE next_attempt_at END,
 last_error=left(p_error,250),external_message_id=left(p_external_id,160)
 WHERE id=p_event;
 RETURN true;
END;$f$;
REVOKE ALL ON FUNCTION public.gk2_claim_confirmed_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_complete_confirmed_notification(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_claim_confirmed_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_complete_confirmed_notification(uuid,text,text,text) TO service_role;
COMMIT;