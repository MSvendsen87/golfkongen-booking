CREATE OR REPLACE FUNCTION public.gk2_claim_confirmed_notification()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e record;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT o.id AS event_id,o.kind,o.reservation_id,
 coalesce(r.quickbutik_order_id,'KLIPP-'||r.id::text) AS quickbutik_order_id,CASE WHEN r.quickbutik_order_id IS NULL THEN 'punchcard' ELSE 'quickbutik' END AS payment_source,r.customer_email,r.slot_date,r.resource,r.start_min,r.end_min,
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
 AND (r.quickbutik_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM gk2_private.punchcard_bookings pb WHERE pb.reservation_id=r.id)) AND r.customer_email IS NOT NULL
 ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE gk2_private.notification_outbox
 SET status='sending',attempts=attempts+1,last_attempt_at=now(),last_error=NULL
 WHERE id=e.event_id;
 RETURN jsonb_build_object('eventId',e.event_id,'kind',e.kind,
 'bookingId',e.reservation_id,'orderId',e.quickbutik_order_id,'paymentSource',e.payment_source,
 'email',e.customer_email,'day',e.slot_date,'resource',e.resource,
 'startMin',e.start_min,'endMin',e.end_min,'rentalSets',e.rental_sets_count,
 'productId',e.quickbutik_product_id);
END;$function$
;
CREATE OR REPLACE FUNCTION public.gk2_get_or_create_nuki_access(p_reservation uuid, p_ciphertext text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE a gk2_private.booking_access_codes%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_reservation IS NULL OR p_ciphertext IS NULL OR length(p_ciphertext)<32
 OR p_name IS NULL OR length(p_name) NOT BETWEEN 8 AND 32
 THEN RAISE EXCEPTION 'invalid_nuki_candidate'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM gk2_private.reservations
  WHERE id=p_reservation AND status='confirmed'
  AND verified_paid_at IS NOT NULL AND (quickbutik_order_id IS NOT NULL OR EXISTS (SELECT 1 FROM gk2_private.punchcard_bookings pb WHERE pb.reservation_id=p_reservation))
 ) THEN RAISE EXCEPTION 'booking_not_paid_confirmed'; END IF;
 INSERT INTO gk2_private.booking_access_codes(reservation_id,encrypted_code,authorization_name)
 VALUES(p_reservation,p_ciphertext,p_name)
 ON CONFLICT(reservation_id) DO NOTHING;
 SELECT * INTO a FROM gk2_private.booking_access_codes
 WHERE reservation_id=p_reservation FOR UPDATE;
 RETURN jsonb_build_object('bookingId',a.reservation_id,'ciphertext',a.encrypted_code,
 'name',a.authorization_name,'status',a.status,'lockId',a.lock_id,
 'authId',a.nuki_authorization_id,'emailId',a.email_id,'updatedAt',a.updated_at);
END;$function$
;
