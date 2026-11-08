-- Admin-only read of staff bypass code registrations. Hashes never leave the server.
CREATE OR REPLACE FUNCTION public.gk2_hyzr_staff_list(p_actor text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'pg_catalog','gk2_private'
AS $fn$
DECLARE v_data jsonb;
BEGIN
 IF current_user IS DISTINCT FROM 'service_role' OR NOT public.gk2_is_admin(p_actor)
 THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'email',s.email,'active',s.active,'issuedAt',s.issued_at,
    'lastUsedAt',s.last_used_at,'lockedUntil',s.locked_until
 ) ORDER BY s.email),'[]'::jsonb) INTO v_data
 FROM gk2_private.hyzr_staff_codes s;
 RETURN jsonb_build_object('ok',true,'staff',v_data);
END;$fn$;
REVOKE ALL ON FUNCTION public.gk2_hyzr_staff_list(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_hyzr_staff_list(text) TO service_role;