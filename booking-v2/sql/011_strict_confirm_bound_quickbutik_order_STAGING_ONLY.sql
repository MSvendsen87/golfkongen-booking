-- Booking 2.0 staging only. Requires 010_checkout_order_binding_STAGING_ONLY.sql.
-- Server MUST verify paid Quickbutik V1 order/status, exact amount, customer, SKU
-- and webhook authentication before invoking this service_role-only RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.gk2_confirm_paid_slot(
 p_reservation uuid,p_order text,p_amount_ore integer,p_event_id text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private'
AS $function$
DECLARE
 b gk2_private.reservations%ROWTYPE;
 v_claims integer;v_required integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
    OR p_event_id IS NULL OR length(p_event_id)<8 OR length(p_event_id)>160
    OR p_amount_ore IS NULL OR p_amount_ore<0 OR p_amount_ore>100000000
 THEN RAISE EXCEPTION 'invalid_payment';END IF;

 SELECT * INTO b FROM gk2_private.reservations WHERE id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown_booking';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(b.slot_date::text,0));
 SELECT * INTO b FROM gk2_private.reservations WHERE id=p_reservation FOR UPDATE;

 -- A paid order must have been bound to this exact hold at checkout initiation.
 -- Do not allow a webhook to pick an available reservation after the fact.
 IF b.quickbutik_order_id IS NULL OR b.quickbutik_order_id<>p_order
 THEN RAISE EXCEPTION 'paid_order_not_bound_to_checkout';END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.payment_events
   WHERE source='quickbutik' AND event_id=p_event_id AND reservation_id<>b.id)
 THEN RAISE EXCEPTION 'payment_event_replay';END IF;
 INSERT INTO gk2_private.payment_events(source,event_id,reservation_id)
 VALUES('quickbutik',p_event_id,b.id) ON CONFLICT DO NOTHING;

 IF b.status='confirmed' THEN
   RETURN jsonb_build_object('status','confirmed','id',b.id,'duplicate',true);
 END IF;
 v_required:=(b.end_min-b.start_min)/30*
   CASE WHEN b.resource='venue' THEN 3 ELSE 1 END;
 SELECT count(*) INTO v_claims FROM gk2_private.claims WHERE reservation_id=b.id;

 IF b.status<>'payment_pending' OR b.hold_expires_at IS NULL
    OR b.hold_expires_at<=now()
    OR v_claims<>v_required
    OR b.quoted_ore IS NULL OR b.quoted_ore<>p_amount_ore
    OR b.customer_email IS NULL OR length(btrim(b.customer_email))<5
    OR b.terms_accepted_at IS NULL OR b.terms_version NOT LIKE 'gk-v%'
 THEN
   DELETE FROM gk2_private.claims WHERE reservation_id=b.id;
   UPDATE gk2_private.reservations
   SET status='paid_unallocated',paid_ore=p_amount_ore,updated_at=now()
   WHERE id=b.id;
   INSERT INTO gk2_private.notification_outbox(reservation_id,kind)
   VALUES(b.id,'manual_review') ON CONFLICT DO NOTHING;
   RETURN jsonb_build_object('status','paid_unallocated','id',b.id);
 END IF;

 UPDATE gk2_private.reservations
 SET status='confirmed',paid_ore=p_amount_ore,verified_paid_at=now(),updated_at=now()
 WHERE id=b.id;
 INSERT INTO gk2_private.notification_outbox(reservation_id,kind)
 VALUES(b.id,'booking_confirmed') ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('status','confirmed','id',b.id,'duplicate',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.gk2_confirm_paid_slot(uuid,text,integer,text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_confirm_paid_slot(uuid,text,integer,text)
 TO service_role;
COMMIT;
