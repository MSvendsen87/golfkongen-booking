ALTER TABLE gk2_private.club_enrolments ADD COLUMN push_state text NOT NULL DEFAULT 'pending' CHECK(push_state IN ('pending','sending','sent','unknown')), ADD COLUMN push_receipt text;
CREATE OR REPLACE FUNCTION public.gk2_club_push_claim() RETURNS jsonb LANGUAGE plpgsql SET search_path TO pg_catalog,gk2_private AS $$
DECLARE e gk2_private.club_enrolments;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE status='confirmed' AND push_state='pending' ORDER BY verified_paid_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE gk2_private.club_enrolments SET push_state='sending' WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'date',e.slot_date,'orderId',e.quickbutik_order_id,'email',e.verified_customer_email,'rentalSets',e.rental_sets,'priceOre',e.seats*5000+e.rental_sets*2500);
END $$;
CREATE OR REPLACE FUNCTION public.gk2_club_push_finish(p_hold uuid,p_receipt text) RETURNS void LANGUAGE plpgsql SET search_path TO pg_catalog,gk2_private AS $$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE gk2_private.club_enrolments SET push_state=CASE WHEN nullif(p_receipt,'') IS NULL THEN 'unknown' ELSE 'sent' END,push_receipt=nullif(p_receipt,'') WHERE id=p_hold AND push_state='sending';
END $$;
REVOKE ALL ON FUNCTION public.gk2_club_push_claim(),public.gk2_club_push_finish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_club_push_claim(),public.gk2_club_push_finish(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_club_access_get(p_day date, p_ciphertext text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE a gk2_private.club_shared_access%ROWTYPE;active_count integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT count(*) INTO active_count FROM gk2_private.club_enrolments WHERE slot_date=p_day AND status='confirmed';
 IF active_count>0 AND p_ciphertext IS NOT NULL THEN
  INSERT INTO gk2_private.club_shared_access(slot_date,ciphertext,name) VALUES(p_day,p_ciphertext,'GK2C-'||replace(p_day::text,'-','')||'-1')
  ON CONFLICT(slot_date) DO UPDATE SET ciphertext=CASE WHEN club_shared_access.status='revoked' THEN excluded.ciphertext ELSE club_shared_access.ciphertext END,
   generation=CASE WHEN club_shared_access.status='revoked' THEN club_shared_access.generation+1 ELSE club_shared_access.generation END,
   name=CASE WHEN club_shared_access.status='revoked' THEN 'GK2C-'||replace(p_day::text,'-','')||'-'||(club_shared_access.generation+1)::text ELSE club_shared_access.name END,
   status=CASE WHEN club_shared_access.status='revoked' THEN 'prepared' ELSE club_shared_access.status END,
   alert_email_id=CASE WHEN club_shared_access.status='revoked' THEN NULL ELSE club_shared_access.alert_email_id END;
 END IF;
 SELECT * INTO a FROM gk2_private.club_shared_access WHERE slot_date=p_day;
 RETURN jsonb_build_object('access',to_jsonb(a),'active',active_count,'recipients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'email',e.verified_customer_email,'orderId',e.quickbutik_order_id,'priceOre',e.seats*5000+e.rental_sets*2500,'rentalSets',e.rental_sets)),'[]'::jsonb) FROM gk2_private.club_enrolments e WHERE slot_date=p_day AND status='confirmed' AND access_email_id IS NULL));
END $function$

