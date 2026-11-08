-- HYZR personal staff bypass, testing only. Never drives the Windows PC.
-- Staff codes must be issued individually by an authenticated admin.
-- Staff can only bypass for their OWN paid HYZR booking; no shared master code.
CREATE TABLE IF NOT EXISTS gk2_private.hyzr_staff_codes (
  email text PRIMARY KEY CHECK(email = lower(btrim(email)) AND length(email) BETWEEN 5 AND 255),
  code_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
  locked_until timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE TABLE IF NOT EXISTS gk2_private.hyzr_staff_overrides (
  reservation_id uuid PRIMARY KEY REFERENCES gk2_private.reservations(id),
  employee_email text NOT NULL REFERENCES gk2_private.hyzr_staff_codes(email),
  enabled_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gk2_hyzr_staff_override_by_expiry
ON gk2_private.hyzr_staff_overrides(valid_until)
WHERE revoked_at IS NULL;
ALTER TABLE gk2_private.hyzr_staff_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gk2_private.hyzr_staff_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE gk2_private.hyzr_staff_codes,gk2_private.hyzr_staff_overrides FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE gk2_private.hyzr_staff_codes,gk2_private.hyzr_staff_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_staff_issue_code(p_actor text,p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_email text:=lower(btrim(p_email));v_bytes bytea;v_code text:='';v_i integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'admin_forbidden'; END IF;
 IF v_email IS NULL OR length(v_email)>255 OR v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$'
 THEN RAISE EXCEPTION 'invalid_employee_email'; END IF;
 v_bytes:=extensions.gen_random_bytes(8);
 FOR v_i IN 0..7 LOOP
   v_code:=v_code||(get_byte(v_bytes,v_i)%10)::text;
 END LOOP;
 INSERT INTO gk2_private.hyzr_staff_codes(email,code_hash)
 VALUES(v_email,extensions.crypt(v_code,extensions.gen_salt('bf',12)))
 ON CONFLICT(email) DO UPDATE
 SET code_hash=excluded.code_hash,active=true,failed_attempts=0,
     locked_until=NULL,issued_at=now();
 UPDATE gk2_private.hyzr_staff_overrides
 SET revoked_at=now(),updated_at=now()
 WHERE employee_email=v_email AND revoked_at IS NULL;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(lower(btrim(p_actor)),'hyzr_staff_code_issued',v_email,'{"secret_not_logged":true}'::jsonb);
 RETURN jsonb_build_object('ok',true,'employee',v_email,'code',v_code,
   'message','Vis koden bare én gang. Ikke lagre i klartekst.');
END;$fn$;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_staff_revoke_code(p_actor text,p_email text)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_email text:=lower(btrim(p_email));v_count integer;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'admin_forbidden'; END IF;
 UPDATE gk2_private.hyzr_staff_codes SET active=false,locked_until=NULL
 WHERE email=v_email AND active=true;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 UPDATE gk2_private.hyzr_staff_overrides
 SET revoked_at=now(),updated_at=now()
 WHERE employee_email=v_email AND revoked_at IS NULL;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(lower(btrim(p_actor)),'hyzr_staff_code_revoked',v_email,'{}'::jsonb);
 RETURN v_count>0;
END;$fn$;

CREATE OR REPLACE FUNCTION public.gk2_hyzr_staff_enable(p_reservation uuid,p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_booking gk2_private.reservations%ROWTYPE;
 v_staff gk2_private.hyzr_staff_codes%ROWTYPE;v_open integer;
 v_begin timestamptz;v_finish timestamptz;v_allowed_until timestamptz;
 v_fails integer;
BEGIN
 -- This function must only be invoked through a backend that has authenticated
 -- the unique HYZR physical device, and must never be directly browser exposed.
 IF current_user IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 IF p_reservation IS NULL OR p_code IS NULL OR p_code !~ '^[0-9]{8}$'
 THEN RETURN jsonb_build_object('ok',false,'code','invalid_staff_code');END IF;
 SELECT * INTO v_booking FROM gk2_private.reservations
 WHERE id=p_reservation AND resource='hyzr' AND status='confirmed'
   AND verified_paid_at IS NOT NULL AND paid_ore IS NOT NULL
   AND customer_email IS NOT NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','not_employee_booking');END IF;
 v_begin:=(v_booking.slot_date::timestamp+make_interval(mins=>v_booking.start_min)) AT TIME ZONE 'Europe/Oslo';
 v_finish:=(v_booking.slot_date::timestamp+make_interval(mins=>v_booking.end_min)) AT TIME ZONE 'Europe/Oslo';
 IF now()<v_begin OR now()>=v_finish+interval '10 minutes'
 THEN RETURN jsonb_build_object('ok',false,'code','booking_outside_staff_window');END IF;
 SELECT h.closes_min INTO v_open FROM gk2_private.opening_hours h
 WHERE h.resource='hyzr' AND h.weekday=extract(isodow from v_booking.slot_date)::integer AND h.active;
 IF v_open IS NULL THEN RETURN jsonb_build_object('ok',false,'code','closed');END IF;
 v_allowed_until:=(v_booking.slot_date::timestamp+make_interval(mins=>v_open)) AT TIME ZONE 'Europe/Oslo';
 IF v_allowed_until<=now() THEN RETURN jsonb_build_object('ok',false,'code','closed');END IF;
 SELECT * INTO v_staff FROM gk2_private.hyzr_staff_codes
 WHERE email=lower(btrim(v_booking.customer_email)) AND active FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','staff_code_not_active');END IF;
 IF v_staff.locked_until IS NOT NULL AND v_staff.locked_until>now()
 THEN RETURN jsonb_build_object('ok',false,'code','staff_code_temporarily_locked');END IF;
 IF extensions.crypt(p_code,v_staff.code_hash) IS DISTINCT FROM v_staff.code_hash THEN
   v_fails:=CASE WHEN v_staff.locked_until IS NULL OR v_staff.locked_until<=now()
                THEN least(v_staff.failed_attempts+1,5) ELSE 1 END;
   UPDATE gk2_private.hyzr_staff_codes
   SET failed_attempts=v_fails,locked_until=CASE WHEN v_fails>=5 THEN now()+interval '15 minutes' ELSE NULL END
   WHERE email=v_staff.email;
   INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
   VALUES(v_staff.email,'hyzr_staff_bypass_rejected',p_reservation::text,
     jsonb_build_object('temporary_lock',v_fails>=5));
   RETURN jsonb_build_object('ok',false,'code','invalid_staff_code');
 END IF;
 UPDATE gk2_private.hyzr_staff_codes
 SET failed_attempts=0,locked_until=NULL,last_used_at=now() WHERE email=v_staff.email;
 INSERT INTO gk2_private.hyzr_staff_overrides(reservation_id,employee_email,valid_until)
 VALUES(p_reservation,v_staff.email,v_allowed_until)
 ON CONFLICT(reservation_id) DO UPDATE
 SET employee_email=excluded.employee_email,valid_until=excluded.valid_until,
     enabled_at=now(),revoked_at=NULL,updated_at=now();
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(v_staff.email,'hyzr_staff_bypass_enabled',p_reservation::text,
   jsonb_build_object('until',v_allowed_until));
 RETURN jsonb_build_object('ok',true,'mode','staff','booking',p_reservation,'validUntil',v_allowed_until);
END;$fn$;

REVOKE ALL ON FUNCTION public.gk2_hyzr_staff_issue_code(text,text),
  public.gk2_hyzr_staff_revoke_code(text,text),
  public.gk2_hyzr_staff_enable(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_staff_issue_code(text,text),
  public.gk2_hyzr_staff_revoke_code(text,text),
  public.gk2_hyzr_staff_enable(uuid,text) TO service_role;
