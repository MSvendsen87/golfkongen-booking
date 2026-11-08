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
   v_fails:=CASE WHEN v_staff.locked_until IS NOT NULL AND v_staff.locked_until<=now()
                THEN 1 ELSE least(v_staff.failed_attempts+1,5) END;
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

REVOKE ALL ON FUNCTION public.gk2_hyzr_staff_enable(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_staff_enable(uuid,text) TO service_role;
