ALTER TABLE gk2_private.booking_settings ADD COLUMN IF NOT EXISTS club_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE gk2_private.club_enrolments ADD COLUMN IF NOT EXISTS rental_sets integer NOT NULL DEFAULT 0 CHECK(rental_sets BETWEEN 0 AND 1);
ALTER TABLE gk2_private.club_enrolments ADD COLUMN IF NOT EXISTS access_email_id text;
CREATE TABLE IF NOT EXISTS gk2_private.club_login_attempts(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,email_hash text NOT NULL,ip_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS club_login_attempts_email_idx ON gk2_private.club_login_attempts(email_hash,created_at);
CREATE INDEX IF NOT EXISTS club_login_attempts_ip_idx ON gk2_private.club_login_attempts(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS gk2_private.club_shared_access(
 slot_date date PRIMARY KEY, generation integer NOT NULL DEFAULT 1, ciphertext text NOT NULL,
 name text NOT NULL, status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','creating','active','revoking','revoked','manual_review')),
 auth_id text, alert_email_id text, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE gk2_private.club_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.club_shared_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.club_login_attempts,gk2_private.club_shared_access FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON gk2_private.club_login_attempts TO service_role;
GRANT USAGE,SELECT ON SEQUENCE gk2_private.club_login_attempts_id_seq TO service_role;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_shared_access TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_club_login_attempt(p_email_hash text,p_ip_hash text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' OR p_email_hash!~'^[a-f0-9]{64}$' OR p_ip_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('club-email-'||p_email_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('club-ip-'||p_ip_hash,0));
 IF (SELECT count(*) FROM gk2_private.club_login_attempts WHERE email_hash=p_email_hash AND created_at>now()-interval '1 hour')>=3
 OR (SELECT count(*) FROM gk2_private.club_login_attempts WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=20 THEN RETURN false; END IF;
 DELETE FROM gk2_private.club_login_attempts WHERE created_at<now()-interval '2 days';
 INSERT INTO gk2_private.club_login_attempts(email_hash,ip_hash) VALUES(p_email_hash,p_ip_hash); RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_prepare_member(p_key uuid,p_day date,p_customer text,p_email text,p_sets integer) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
DECLARE h jsonb; e gk2_private.club_enrolments%ROWTYPE;v gk2_private.club_checkout_variants%ROWTYPE;sk text; inserted uuid; existing_variant bigint;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_sets IS NULL OR p_sets NOT BETWEEN 0 AND 1 OR p_email IS NULL OR p_email!~'^[^ @]+@[^ @]+[.][^ @]+$' THEN RAISE EXCEPTION 'invalid_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 IF EXISTS(SELECT 1 FROM gk2_private.club_enrolments WHERE slot_date=p_day AND lower(verified_customer_email)=lower(p_email)
 AND idempotency_key<>p_key AND (status='confirmed' OR (status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed')))))
 THEN RAISE EXCEPTION 'member_already_booked'; END IF;
 IF p_sets=1 AND (SELECT coalesce(sum(rental_sets),0) FROM gk2_private.club_enrolments WHERE slot_date=p_day
 AND idempotency_key<>p_key AND (status='confirmed' OR (status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed')))))>=8 THEN RAISE EXCEPTION 'no_rental_sets'; END IF;
 INSERT INTO gk2_private.club_access_stage(customer_id,active) VALUES(p_customer,true) ON CONFLICT(customer_id) DO UPDATE SET active=true;
 h:=public.gk2_hold_club_seats(p_key,p_day,p_customer,1);
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=(h->>'id')::uuid FOR UPDATE;
 IF e.status<>'held' OR e.hold_expires_at<=now() THEN RAISE EXCEPTION 'hold_inactive'; END IF;
 IF e.verified_customer_email IS NOT NULL AND (e.verified_customer_email<>lower(p_email) OR e.rental_sets<>p_sets) THEN RAISE EXCEPTION 'key_reuse'; END IF;
 UPDATE gk2_private.club_enrolments SET verified_customer_email=lower(p_email),rental_sets=p_sets WHERE id=e.id;
 SELECT * INTO v FROM gk2_private.club_checkout_variants WHERE slot_date=p_day AND enabled;
 sk:='GK2-CLUB-'||p_day::text||'-'||replace(e.id::text,'-','');
 INSERT INTO gk2_private.club_checkout_leases(enrolment_id,variant_id,sku,lease_state) VALUES(e.id,0,sk,'opening') ON CONFLICT(enrolment_id) DO NOTHING RETURNING enrolment_id INTO inserted;
 IF inserted IS NULL THEN
  SELECT variant_id INTO existing_variant FROM gk2_private.club_checkout_leases WHERE enrolment_id=e.id AND lease_state='open';
  IF existing_variant IS NULL THEN RAISE EXCEPTION 'club_checkout_preparing'; END IF;
 END IF;
 RETURN h||jsonb_build_object('sku',sk,'priceOre',5000,'rentalSets',p_sets,'expires',e.hold_expires_at,'variantId',existing_variant);
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_opened(p_hold uuid,p_variant bigint) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
BEGIN
 IF current_user<>'service_role' OR p_variant<=0 THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_hold;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.slot_date::text,0));
 IF e.status<>'held' OR e.hold_expires_at<=now() THEN RAISE EXCEPTION 'hold_inactive'; END IF;
 UPDATE gk2_private.club_checkout_leases SET variant_id=p_variant,lease_state='open',updated_at=now() WHERE enrolment_id=p_hold AND lease_state IN ('opening','open');
 IF NOT FOUND THEN RAISE EXCEPTION 'lease_not_openable'; END IF;
 UPDATE gk2_private.club_enrolments SET hold_expires_at=greatest(hold_expires_at,now()+interval '30 minutes') WHERE id=p_hold;
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_maintenance() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN jsonb_build_object('leases',(SELECT coalesce(jsonb_agg(jsonb_build_object('holdId',e.id,'date',e.slot_date,'sku',l.sku,'variantId',l.variant_id)),'[]'::jsonb)
 FROM gk2_private.club_enrolments e JOIN gk2_private.club_checkout_leases l ON l.enrolment_id=e.id
 WHERE l.lease_state<>'closed' AND (e.status IN ('confirmed','cancelled','expired') OR e.hold_expires_at<=now())),
 'dates',(SELECT coalesce(jsonb_agg(d.slot_date),'[]'::jsonb) FROM
 (SELECT DISTINCT e.slot_date FROM gk2_private.club_enrolments e LEFT JOIN gk2_private.club_shared_access a ON a.slot_date=e.slot_date
 WHERE e.status='confirmed' AND ((e.slot_date+time '22:15') AT TIME ZONE 'Europe/Oslo')>now() AND (e.access_email_id IS NULL OR a.status IS DISTINCT FROM 'active')
 UNION SELECT a.slot_date FROM gk2_private.club_shared_access a WHERE a.status<>'revoked'
 AND (a.status<>'active' OR NOT EXISTS(SELECT 1 FROM gk2_private.club_enrolments e WHERE e.slot_date=a.slot_date AND e.status='confirmed')
 OR ((a.slot_date+time '22:15') AT TIME ZONE 'Europe/Oslo')<=now())) d));
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_closed(p_hold uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
DECLARE d date;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT slot_date INTO d FROM gk2_private.club_enrolments WHERE id=p_hold;
 PERFORM pg_advisory_xact_lock(hashtextextended(d::text,0));
 UPDATE gk2_private.club_checkout_leases SET lease_state='closed',updated_at=now() WHERE enrolment_id=p_hold;
 UPDATE gk2_private.club_enrolments SET status='expired' WHERE id=p_hold AND status IN ('held','payment_pending') AND hold_expires_at<=now();
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_access_get(p_day date,p_ciphertext text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
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
 RETURN jsonb_build_object('access',to_jsonb(a),'active',active_count,'recipients',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'email',e.verified_customer_email,'orderId',e.quickbutik_order_id)),'[]'::jsonb) FROM gk2_private.club_enrolments e WHERE slot_date=p_day AND status='confirmed' AND access_email_id IS NULL));
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_access_update(p_day date,p_generation integer,p_status text,p_auth text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' OR p_status NOT IN ('creating','active','revoking','revoked','manual_review') THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE gk2_private.club_shared_access SET status=p_status,auth_id=coalesce(p_auth,auth_id),updated_at=now() WHERE slot_date=p_day AND generation=p_generation;
 RETURN FOUND;
END $f$;
CREATE OR REPLACE FUNCTION public.gk2_club_access_emailed(p_hold uuid,p_receipt text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE gk2_private.club_enrolments SET access_email_id=p_receipt WHERE id=p_hold AND status='confirmed' AND access_email_id IS NULL;RETURN FOUND;
END $f$;
DO $grants$ DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure r FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
('gk2_club_login_attempt','gk2_club_prepare_member','gk2_club_opened','gk2_club_maintenance','gk2_club_closed','gk2_club_access_get','gk2_club_access_update','gk2_club_access_emailed')
LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.r||' FROM PUBLIC,anon,authenticated';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.r||' TO service_role';END LOOP;END $grants$;

CREATE TABLE IF NOT EXISTS gk2_private.club_worker_lock(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),owner uuid,until_at timestamptz);
ALTER TABLE gk2_private.club_worker_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.club_worker_lock FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON gk2_private.club_worker_lock TO service_role;
CREATE OR REPLACE FUNCTION public.gk2_club_worker(p_key uuid,p_release boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' OR p_key IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_release THEN UPDATE gk2_private.club_worker_lock SET until_at=now() WHERE singleton AND owner=p_key;RETURN FOUND;END IF;
 INSERT INTO gk2_private.club_worker_lock(singleton,owner,until_at) VALUES(true,p_key,now()+interval '3 minutes')
 ON CONFLICT(singleton) DO UPDATE SET owner=excluded.owner,until_at=excluded.until_at WHERE club_worker_lock.until_at<=now();
 RETURN FOUND;
END $f$;
REVOKE ALL ON FUNCTION public.gk2_club_worker(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_club_worker(uuid,boolean) TO service_role;

ALTER TABLE gk2_private.club_shared_access ADD COLUMN IF NOT EXISTS alert_email_id text;

CREATE OR REPLACE FUNCTION public.gk2_club_access_alerted(p_day date,p_generation integer,p_receipt text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,gk2_private AS $f$
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 UPDATE gk2_private.club_shared_access SET alert_email_id=p_receipt WHERE slot_date=p_day AND generation=p_generation AND alert_email_id IS NULL;
 RETURN FOUND;
END $f$;
REVOKE ALL ON FUNCTION public.gk2_club_access_alerted(date,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_club_access_alerted(date,integer,text) TO service_role;

ALTER TABLE gk2_private.club_enrolments ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE gk2_private.club_enrolments ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT 'gk-v1-club-20261029';
-- Club evenings reserve all activities Thursday 19:00–22:00; 50 NOK, 10 seats.
CREATE OR REPLACE FUNCTION public.gk2_hold_slot(p_key uuid, p_day date, p_resource text, p_start integer, p_duration integer, p_terms text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid;v_end integer;v_exp timestamptz:=now()+interval '10 minutes';
 v_existing gk2_private.reservations%ROWTYPE;v_resources text[];v_code text;v_slot integer;
 v_weekday integer;v_today date;v_mins integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF NOT EXISTS(SELECT 1 FROM gk2_private.release_gates WHERE singleton
    AND legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
    AND checkout_paid_webhook_verified AND pushover_end_to_end_verified
    AND admin_auth_verified AND concurrency_verified AND legacy_cron_switch_verified)
 THEN RAISE EXCEPTION 'gk2_launch_locked';END IF;
 IF p_key IS NULL OR p_day IS NULL OR p_resource IS NULL OR p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
   OR p_start IS NULL OR p_duration IS NULL OR p_terms IS NULL OR p_terms NOT LIKE 'gk-v%' THEN RAISE EXCEPTION 'bad_request'; END IF;
 IF p_day < (SELECT first_bookable_date FROM gk2_private.booking_settings WHERE singleton) THEN RAISE EXCEPTION 'first_bookable_date_2026_11_01';END IF;
 v_end:=p_start+p_duration;
 IF p_duration%30<>0 OR p_start%30<>0 OR p_start<0 OR v_end>1440 OR
  (p_resource='venue' AND (p_duration<240 OR p_duration>720 OR p_duration%60<>0)) OR
  (p_resource<>'venue' AND (p_duration<30 OR p_duration>240))
 THEN RAISE EXCEPTION 'invalid_duration';END IF;
 v_today:=(now() AT TIME ZONE 'Europe/Oslo')::date;
 v_mins:=extract(hour from now() AT TIME ZONE 'Europe/Oslo')::int*60+
         extract(minute from now() AT TIME ZONE 'Europe/Oslo')::int;
 IF p_day<v_today OR p_day>v_today+(SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton) OR (p_day=v_today AND p_start<v_mins+20) THEN RAISE EXCEPTION 'out_of_window';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT * INTO v_existing FROM gk2_private.reservations WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.slot_date<>p_day OR v_existing.resource<>p_resource OR v_existing.start_min<>p_start OR v_existing.end_min<>v_end
  THEN RAISE EXCEPTION 'key_reuse';END IF;
  RETURN jsonb_build_object('id',v_existing.id,'status',v_existing.status,'hold_expires_at',v_existing.hold_expires_at);
 END IF;
 DELETE FROM gk2_private.claims c USING gk2_private.reservations b
 WHERE c.reservation_id=b.id AND b.slot_date=p_day AND b.status IN ('held','payment_pending') AND b.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=b.id AND l.status<>'closed');
 UPDATE gk2_private.reservations AS r SET status='expired',updated_at=now()
 WHERE r.slot_date=p_day AND r.status IN ('held','payment_pending') AND r.hold_expires_at<now()
 AND NOT EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
  WHERE l.reservation_id=r.id AND l.status<>'closed');
 v_weekday:=extract(isodow from p_day)::int;
 v_resources:=CASE WHEN p_resource='venue' THEN ARRAY['hyzr','dart_a','dart_b']::text[] ELSE ARRAY[p_resource]::text[] END;
 IF EXISTS (SELECT 1 FROM unnest(array_append(v_resources,p_resource)) AS r(x)
   LEFT JOIN gk2_private.opening_hours h ON h.resource=r.x AND h.weekday=v_weekday
   WHERE h.resource IS NULL OR h.active=false OR p_start<h.opens_min OR v_end>h.closes_min)
 THEN RAISE EXCEPTION 'closed_hours';END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.blocks bl WHERE bl.active AND p_day BETWEEN bl.date_from AND bl.date_to
  AND (bl.weekdays IS NULL OR array_length(bl.weekdays,1) IS NULL OR v_weekday=ANY(bl.weekdays))
  AND p_start<bl.end_min AND v_end>bl.start_min
  AND (bl.target='all' OR (bl.target='venue_only' AND p_resource='venue')
       OR bl.target=ANY(v_resources))) THEN RAISE EXCEPTION 'blocked_time';END IF;
 IF p_resource IN ('hyzr','dart_a','dart_b','venue') AND p_start<1320 AND v_end>1140
 AND EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND (ce.hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=ce.id AND cl.lease_state<>'closed'))))) THEN RAISE EXCEPTION 'club_already_reserved'; END IF;
 INSERT INTO gk2_private.reservations(idempotency_key,slot_date,resource,start_min,end_min,status,hold_expires_at,terms_version)
 VALUES(p_key,p_day,p_resource,p_start,v_end,'held',v_exp,p_terms) RETURNING id INTO v_id;
 FOREACH v_code IN ARRAY v_resources LOOP
  FOR v_slot IN SELECT generate_series(p_start,v_end-30,30) LOOP
   INSERT INTO gk2_private.claims(physical_resource,slot_date,slot_min,reservation_id)
   VALUES(v_code,p_day,v_slot,v_id);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('id',v_id,'status','held','hold_expires_at',v_exp);
END; $function$;
CREATE OR REPLACE FUNCTION public.gk2_day_availability(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_claims jsonb;v_blocks jsonb;v_hours jsonb;v_enabled boolean;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_day IS NULL OR p_day < ((now() AT TIME ZONE 'Europe/Oslo')::date-1) OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date+(SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton) THEN RAISE EXCEPTION 'date out of range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('resource',c.physical_resource,'slot_min',c.slot_min)), '[]'::jsonb)
 INTO v_claims FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'target',b.target,'start_min',b.start_min,'end_min',b.end_min,'label',b.label)), '[]'::jsonb)
 INTO v_blocks FROM gk2_private.blocks b WHERE b.active AND p_day BETWEEN b.date_from AND b.date_to
 AND (b.weekdays IS NULL OR array_length(b.weekdays,1) IS NULL OR extract(isodow from p_day)::int=ANY(b.weekdays));
 SELECT coalesce(jsonb_object_agg(h.resource,jsonb_build_object('from',h.opens_min,'to',h.closes_min)), '{}'::jsonb)
 INTO v_hours FROM gk2_private.opening_hours h WHERE h.weekday=extract(isodow from p_day)::int AND h.active;
 SELECT (legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
  AND checkout_paid_webhook_verified AND pushover_end_to_end_verified AND admin_auth_verified
  AND concurrency_verified AND legacy_cron_switch_verified) INTO v_enabled
 FROM gk2_private.release_gates WHERE singleton;
 IF EXISTS (SELECT 1 FROM gk2_private.club_enrolments ce WHERE ce.slot_date=p_day AND (ce.status='confirmed' OR (ce.status IN ('held','payment_pending') AND (ce.hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=ce.id AND cl.lease_state<>'closed'))))) THEN
  v_blocks:=v_blocks||jsonb_build_array(
   jsonb_build_object('target','hyzr','start_min',1140,'end_min',1320),
   jsonb_build_object('target','dart_a','start_min',1140,'end_min',1320),
   jsonb_build_object('target','dart_b','start_min',1140,'end_min',1320));
 END IF;
 RETURN jsonb_build_object('day',p_day,'claims',v_claims,'blocks',v_blocks,'openingHoursByResource',v_hours,
  'bookingEnabled',coalesce(v_enabled,false));
END;$function$;
CREATE OR REPLACE FUNCTION public.gk2_hold_club_seats(p_key uuid, p_day date, p_customer text, p_seats integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_row gk2_private.club_enrolments%ROWTYPE; v_count integer; v_id uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM gk2_private.release_gates WHERE singleton
 AND legacy_paid_orders_verified AND legacy_rules_verified AND customer_group_prices_verified
 AND checkout_paid_webhook_verified AND pushover_end_to_end_verified AND admin_auth_verified
 AND concurrency_verified AND legacy_cron_switch_verified)
 THEN RAISE EXCEPTION 'gk2_launch_locked'; END IF;
 IF p_key IS NULL OR p_day IS NULL OR extract(isodow from p_day)<>4
 OR p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 10 OR p_customer IS NULL
 OR p_day < (now() AT TIME ZONE 'Europe/Oslo')::date
 OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date + (SELECT horizon_days FROM gk2_private.booking_settings WHERE singleton)
 THEN RAISE EXCEPTION 'invalid_club_request'; END IF;
 IF p_day < (SELECT first_bookable_date FROM gk2_private.booking_settings WHERE singleton)
 OR ((p_day+time '19:00') AT TIME ZONE 'Europe/Oslo')<=now()+interval '30 minutes'
 THEN RAISE EXCEPTION 'club_signup_closed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM gk2_private.booking_settings WHERE singleton AND club_enabled)
 THEN RAISE EXCEPTION 'club_checkout_variant_disabled'; END IF;
 IF EXISTS(SELECT 1 FROM gk2_private.blocks WHERE active AND p_day BETWEEN date_from AND date_to
 AND (weekdays IS NULL OR array_length(weekdays,1) IS NULL OR 4=ANY(weekdays))
 AND start_min<1320 AND end_min>1140 AND target IN ('all','hyzr','dart_a','dart_b'))
 THEN RAISE EXCEPTION 'club_blocked_time'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_day::text,0));
 SELECT * INTO v_row FROM gk2_private.club_enrolments WHERE idempotency_key=p_key FOR UPDATE;
 IF FOUND THEN
   IF v_row.slot_date<>p_day OR v_row.customer_id<>p_customer OR v_row.seats<>p_seats THEN RAISE EXCEPTION 'key_reuse'; END IF;
   RETURN jsonb_build_object('id',v_row.id,'status',v_row.status);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM gk2_private.club_access_stage WHERE customer_id=p_customer AND active) THEN
 RAISE EXCEPTION 'club_access_denied'; END IF;
 IF EXISTS(
 SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND c.physical_resource IN ('hyzr','dart_a','dart_b') AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND
 (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))))
 ) THEN RAISE EXCEPTION 'dart_already_reserved'; END IF;
 SELECT coalesce(sum(seats),0) INTO v_count FROM gk2_private.club_enrolments
 WHERE slot_date=p_day AND (status='confirmed' OR (status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed'))));
 IF v_count+p_seats>10 THEN RAISE EXCEPTION 'club_full'; END IF;
 INSERT INTO gk2_private.club_enrolments(idempotency_key,slot_date,customer_id,seats,status,hold_expires_at)
 VALUES(p_key,p_day,p_customer,p_seats,'held',now()+interval '10 minutes') RETURNING id INTO v_id;
 RETURN jsonb_build_object('id',v_id,'status','held','remaining',10-v_count-p_seats);
END $function$;
CREATE OR REPLACE FUNCTION public.gk2_club_day_status(p_day date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_used integer; v_dart boolean; v_horizon integer;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_day IS NULL OR extract(isodow from p_day)<>4 THEN RAISE EXCEPTION 'not_club_thursday'; END IF;
 SELECT horizon_days INTO v_horizon FROM gk2_private.booking_settings WHERE singleton;
 IF p_day < (now() AT TIME ZONE 'Europe/Oslo')::date OR p_day > (now() AT TIME ZONE 'Europe/Oslo')::date + v_horizon
 THEN RAISE EXCEPTION 'date_out_of_window'; END IF;
 IF p_day < (SELECT first_bookable_date FROM gk2_private.booking_settings WHERE singleton)
 OR ((p_day+time '19:00') AT TIME ZONE 'Europe/Oslo')<=now()+interval '30 minutes'
 THEN RETURN jsonb_build_object('date',p_day,'capacity',10,'reserved',0,'remaining',0,'canBook',false,'reason','signup_closed'); END IF;
 SELECT coalesce(sum(seats),0) INTO v_used FROM gk2_private.club_enrolments
 WHERE slot_date=p_day AND (status='confirmed' OR (status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed'))));
 SELECT EXISTS(
 SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=p_day AND c.physical_resource IN ('hyzr','dart_a','dart_b')
 AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND (r.hold_expires_at>now()
 OR EXISTS(SELECT 1 FROM gk2_private.checkout_variant_leases l WHERE l.reservation_id=r.id AND l.status<>'closed'))))
 ) OR EXISTS(SELECT 1 FROM gk2_private.blocks WHERE active AND p_day BETWEEN date_from AND date_to
 AND (weekdays IS NULL OR array_length(weekdays,1) IS NULL OR 4=ANY(weekdays))
 AND start_min<1320 AND end_min>1140 AND target IN ('all','hyzr','dart_a','dart_b')) INTO v_dart;
 RETURN jsonb_build_object('date',p_day,'capacity',10,'reserved',v_used,'remaining',CASE WHEN v_dart THEN 0 ELSE 10-v_used END,
 'canBook',NOT v_dart AND v_used<10,'reason',CASE WHEN v_dart THEN 'dart_reserved' WHEN v_used>=10 THEN 'club_full' ELSE null END);
END $function$;
CREATE OR REPLACE FUNCTION public.gk2_confirm_club_paid(p_enrolment uuid, p_order text, p_paid_ore integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_enrolment IS NULL OR p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$' OR p_paid_ore IS NULL THEN
 RAISE EXCEPTION 'bad_payment_reference'; END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'club_hold_missing'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.slot_date::text,0));
 SELECT * INTO e FROM gk2_private.club_enrolments WHERE id=p_enrolment FOR UPDATE;
 IF e.status='confirmed' THEN
   IF e.quickbutik_order_id=p_order AND p_paid_ore=e.seats*5000+e.rental_sets*2500 THEN
    RETURN jsonb_build_object('status','confirmed','alreadyConfirmed',true);
   END IF;
   RAISE EXCEPTION 'confirmed_payment_mismatch';
 END IF;
 IF e.status NOT IN ('held','payment_pending') OR e.hold_expires_at<=now()
 THEN RAISE EXCEPTION 'hold_expired_manual_review'; END IF;
 IF p_paid_ore<>e.seats*5000+e.rental_sets*2500 THEN RAISE EXCEPTION 'paid_amount_mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r ON r.id=c.reservation_id
 WHERE c.slot_date=e.slot_date AND c.physical_resource IN ('hyzr','dart_a','dart_b')
 AND c.slot_min BETWEEN 1140 AND 1290 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending')
 AND (r.hold_expires_at>now() OR EXISTS (SELECT 1 FROM gk2_private.checkout_variant_leases l
 WHERE l.reservation_id=r.id AND l.status<>'closed'))))) THEN RAISE EXCEPTION 'dart_conflict_manual_review'; END IF;
 UPDATE gk2_private.club_enrolments SET status='confirmed',quickbutik_order_id=p_order,verified_paid_at=now()
 WHERE id=p_enrolment;
 RETURN jsonb_build_object('status','confirmed','alreadyConfirmed',false);
END $function$;
CREATE OR REPLACE FUNCTION public.gk2_match_club_paid_order(p_order text, p_sku text, p_email text, p_seats integer, p_paid_ore integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE e gk2_private.club_enrolments%ROWTYPE;
 v gk2_private.club_checkout_variants%ROWTYPE;
 v_count integer;
 v_email text:=lower(btrim(p_email));
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_order IS NULL OR p_order !~ '^[1-9][0-9]{0,8}$'
 OR p_sku IS NULL OR p_email IS NULL OR length(v_email)>254
 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 OR p_seats IS NULL OR p_seats NOT BETWEEN 1 AND 10
 OR p_paid_ore IS NULL OR p_paid_ore NOT BETWEEN p_seats*5000 AND p_seats*5000+2500 THEN
  RAISE EXCEPTION 'invalid_club_paid_order'; END IF;
 IF p_sku!~'^GK2-CLUB-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-f0-9]{32}$' THEN RAISE EXCEPTION 'unrecognized_club_sku'; END IF;
 v.slot_date:=substring(p_sku from 10 for 10)::date;
 v.price_ore:=5000;
 PERFORM pg_advisory_xact_lock(hashtextextended(v.slot_date::text,0));
 -- The same trusted webhook may arrive repeatedly while other customers have holds.
 -- Match an already-confirmed order FIRST, without counting unrelated holds.
 SELECT * INTO e FROM gk2_private.club_enrolments
 WHERE quickbutik_order_id=p_order FOR UPDATE;
 IF FOUND THEN
   IF e.slot_date=v.slot_date AND e.seats=p_seats
    AND e.verified_customer_email=v_email AND e.status='confirmed' AND p_paid_ore=e.seats*5000+e.rental_sets*2500
   THEN RETURN jsonb_build_object('matched',true,'alreadyConfirmed',true,'enrolmentId',e.id);
   END IF;
   RETURN jsonb_build_object('matched',false,'reason','existing_order_conflict');
 END IF;
 SELECT count(*) INTO v_count FROM gk2_private.club_enrolments
 WHERE slot_date=v.slot_date AND seats=p_seats AND verified_customer_email=v_email AND EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.sku=p_sku)
 AND status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed'));
 IF v_count<>1 THEN
  RETURN jsonb_build_object('matched',false,'reason','non_unique_or_expired_hold');
 END IF;
 SELECT * INTO e FROM gk2_private.club_enrolments
 WHERE slot_date=v.slot_date AND seats=p_seats AND verified_customer_email=v_email AND EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.sku=p_sku)
 AND status IN ('held','payment_pending') AND (hold_expires_at>now() OR EXISTS(SELECT 1 FROM gk2_private.club_checkout_leases cl WHERE cl.enrolment_id=club_enrolments.id AND cl.lease_state<>'closed'))
 FOR UPDATE;
 IF p_paid_ore<>e.seats*5000+e.rental_sets*2500 THEN RAISE EXCEPTION 'club_paid_amount_mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM gk2_private.claims c JOIN gk2_private.reservations r
 ON r.id=c.reservation_id WHERE c.slot_date=v.slot_date
 AND c.physical_resource IN ('hyzr','dart_a','dart_b') AND c.slot_min BETWEEN 1140 AND 1290
 AND (r.status='confirmed' OR (r.status IN ('held','payment_pending') AND
   (r.hold_expires_at>now() OR EXISTS (
     SELECT 1 FROM gk2_private.checkout_variant_leases l
     WHERE l.reservation_id=r.id AND l.status<>'closed'
   ))))
 ) THEN RETURN jsonb_build_object('matched',false,'reason','dart_conflict'); END IF;
 UPDATE gk2_private.club_enrolments
 SET status='confirmed',quickbutik_order_id=p_order,verified_paid_at=now()
 WHERE id=e.id;
 RETURN jsonb_build_object('matched',true,'alreadyConfirmed',false,'enrolmentId',e.id);
END $function$;
