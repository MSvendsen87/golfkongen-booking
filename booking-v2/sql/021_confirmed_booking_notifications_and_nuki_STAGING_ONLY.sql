-- Booking 2.0 STAGING – two separate, durable post-payment channels:
-- Pushover booking_confirmed and Nuki nuki_access_requested.
-- Existing legacy Quickbutik/Pushover Worker remains untouched.
BEGIN;
ALTER TABLE gk2_private.notification_outbox
 ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
 ADD COLUMN IF NOT EXISTS last_error text,
 ADD COLUMN IF NOT EXISTS sent_at timestamptz,
 ADD COLUMN IF NOT EXISTS external_message_id text;
CREATE INDEX IF NOT EXISTS gk2_outbox_status_idx
 ON gk2_private.notification_outbox(status,created_at);
ALTER TABLE gk2_private.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gk2_private.booking_access_codes(
 reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id),
 lock_id bigint NOT NULL DEFAULT 22722489119 CHECK(lock_id=22722489119),
 encrypted_code text NOT NULL,
 authorization_name text NOT NULL UNIQUE,
 nuki_authorization_id text,
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','creating_unknown','verifying','email_unknown','emailed','cancel_requested','revoking','revoked','manual_review')),
 email_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_error text
);
ALTER TABLE gk2_private.booking_access_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.booking_access_codes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.booking_access_codes TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_claim_confirmed_notification()
RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE e record; p integer;
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
 WHERE o.status='pending'
 AND o.kind IN ('booking_confirmed','nuki_access_requested')
 AND r.status='confirmed' AND r.verified_paid_at IS NOT NULL
 AND r.quickbutik_order_id IS NOT NULL AND r.customer_email IS NOT NULL
 ORDER BY o.created_at
 LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE gk2_private.notification_outbox
 SET status='sending',attempts=attempts+1,last_attempt_at=now(),last_error=NULL
 WHERE id=e.event_id;
 RETURN jsonb_build_object(
 'eventId',e.event_id,'kind',e.kind,'bookingId',e.reservation_id,
 'orderId',e.quickbutik_order_id,'email',e.customer_email,
 'day',e.slot_date,'resource',e.resource,'startMin',e.start_min,
 'endMin',e.end_min,'rentalSets',e.rental_sets_count,
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
 SELECT status INTO old_status FROM gk2_private.notification_outbox
 WHERE id=p_event FOR UPDATE;
 IF old_status IS DISTINCT FROM 'sending' THEN
  RAISE EXCEPTION 'outbox_not_claimed';END IF;
 UPDATE gk2_private.notification_outbox
 SET status=p_state,sent_at=CASE WHEN p_state='sent' THEN now() ELSE sent_at END,
 last_error=left(p_error,250),external_message_id=left(p_external_id,160)
 WHERE id=p_event;
 RETURN true;
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_get_or_create_nuki_access(
 p_reservation uuid,p_ciphertext text,p_name text
) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE a gk2_private.booking_access_codes%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reservation IS NULL OR p_ciphertext IS NULL OR length(p_ciphertext)<32
 OR p_name IS NULL OR length(p_name) NOT BETWEEN 8 AND 32
 THEN RAISE EXCEPTION 'invalid_nuki_candidate'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM gk2_private.reservations
  WHERE id=p_reservation AND status='confirmed'
  AND verified_paid_at IS NOT NULL AND quickbutik_order_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'booking_not_paid_confirmed'; END IF;
 INSERT INTO gk2_private.booking_access_codes(reservation_id,encrypted_code,authorization_name)
 VALUES(p_reservation,p_ciphertext,p_name)
 ON CONFLICT(reservation_id) DO NOTHING;
 SELECT * INTO a FROM gk2_private.booking_access_codes
 WHERE reservation_id=p_reservation FOR UPDATE;
 RETURN jsonb_build_object('bookingId',a.reservation_id,'ciphertext',a.encrypted_code,
 'name',a.authorization_name,'status',a.status,'lockId',a.lock_id,
 'authId',a.nuki_authorization_id,'emailId',a.email_id,'updatedAt',a.updated_at);
END;$f$;

CREATE OR REPLACE FUNCTION public.gk2_set_nuki_access_status(
 p_reservation uuid,p_status text,p_auth_id text DEFAULT NULL,
 p_email_id text DEFAULT NULL,p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE previous text; current_order text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_status NOT IN ('queued','creating_unknown','verifying','email_unknown','emailed','cancel_requested','revoking','revoked','manual_review')
 THEN RAISE EXCEPTION 'invalid_access_state';END IF;
 SELECT a.status,r.status INTO previous,current_order
 FROM gk2_private.booking_access_codes a
 JOIN gk2_private.reservations r ON r.id=a.reservation_id
 WHERE a.reservation_id=p_reservation FOR UPDATE OF a;
 IF previous IS NULL THEN RAISE EXCEPTION 'access_missing'; END IF;
 IF previous IN ('revoked','cancel_requested') AND p_status NOT IN ('revoking','revoked','manual_review')
 THEN RAISE EXCEPTION 'revoked_access_must_not_be_recreated';END IF;
 IF current_order<>'confirmed' AND p_status NOT IN ('cancel_requested','revoking','revoked','manual_review')
 THEN RAISE EXCEPTION 'access_booking_no_longer_confirmed';END IF;
 UPDATE gk2_private.booking_access_codes
 SET status=p_status,updated_at=now(),
 nuki_authorization_id=coalesce(p_auth_id,nuki_authorization_id),
 email_id=coalesce(p_email_id,email_id),last_error=left(p_error,250)
 WHERE reservation_id=p_reservation;
 RETURN true;
END;$f$;

REVOKE ALL ON FUNCTION public.gk2_claim_confirmed_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_complete_confirmed_notification(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_get_or_create_nuki_access(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_set_nuki_access_status(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_claim_confirmed_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_complete_confirmed_notification(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_get_or_create_nuki_access(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_set_nuki_access_status(uuid,text,text,text,text) TO service_role;
COMMIT;