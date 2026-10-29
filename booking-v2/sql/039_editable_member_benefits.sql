BEGIN;
CREATE TABLE gk2_private.group_benefit_texts(
 group_code text PRIMARY KEY CHECK(group_code IN ('ansatte','teamgolfkongen','ambassador','medlemmer','betalt_medlem','frisbee_dart','frisbeeklubb','dartklubb')),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),updated_at timestamptz NOT NULL DEFAULT now(),updated_by text
);
ALTER TABLE gk2_private.group_benefit_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gk2_private.group_benefit_texts FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON gk2_private.group_benefit_texts TO service_role;
INSERT INTO gk2_private.group_benefit_texts(group_code,config)
SELECT x->>'key',x FROM jsonb_array_elements('[{"key":"ansatte","label":"Ansatte","retailText":"30% rabatt i hele butikken","discBookingText":"98% rabatt på booking av disc simulator","dartBookingText":"98% rabatt på booking av dart","clubNightText":"Tilgang til klubbkvelder","retailPriority":100,"discBookingPriority":100,"dartBookingPriority":100},{"key":"teamgolfkongen","label":"Team GolfKongen","retailText":"30% rabatt på discgolf og golfutstyr","discBookingText":"Disc simulator til 100 kr timen","dartBookingText":"","clubNightText":"","retailPriority":90,"discBookingPriority":90,"dartBookingPriority":0},{"key":"ambassador","label":"Ambassadør","retailText":"15% rabatt på discgolfutstyr","discBookingText":"Disc simulator til 100 kr timen","dartBookingText":"","clubNightText":"","retailPriority":80,"discBookingPriority":80,"dartBookingPriority":0},{"key":"betalt_medlem","label":"Medlem","retailText":"","discBookingText":"Disc simulator til 100 kr timen","dartBookingText":"Dart til 100 kr timen","clubNightText":"Tilgang til klubbkvelder","retailPriority":0,"discBookingPriority":70,"dartBookingPriority":70},{"key":"frisbee_dart","label":"Frisbee og dart","retailText":"","discBookingText":"Disc simulator til 120 kr timen","dartBookingText":"Dart til 100 kr timen","clubNightText":"Tilgang til klubbkvelder","retailPriority":50,"discBookingPriority":60,"dartBookingPriority":60},{"key":"frisbeeklubb","label":"Frisbeeklubb","retailText":"10% rabatt på alt av discgolfutstyr","discBookingText":"Disc simulator til 120 kr timen","dartBookingText":"","clubNightText":"","retailPriority":50,"discBookingPriority":50,"dartBookingPriority":0},{"key":"dartklubb","label":"Dartklubb","retailText":"10% rabatt på alt av dartutstyr","discBookingText":"","dartBookingText":"Dart til 100 kr timen","clubNightText":"Tilgang til klubbkvelder","retailPriority":50,"discBookingPriority":0,"dartBookingPriority":50},{"key":"medlemmer","label":"Medlem","retailText":"","discBookingText":"Disc simulator til 100 kr timen","dartBookingText":"","clubNightText":"","retailPriority":0,"discBookingPriority":70,"dartBookingPriority":0}]'::jsonb)x;
CREATE FUNCTION public.gk2_member_benefit_config() RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'forbidden';END IF;
 SELECT jsonb_build_object('schemaVersion',1,'groups',jsonb_object_agg(group_code,config),'updated',max(updated_at))
 INTO result FROM gk2_private.group_benefit_texts;RETURN result;
END $f$;
CREATE FUNCTION public.gk2_admin_benefits_list(p_actor text) RETURNS jsonb LANGUAGE plpgsql
SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE result jsonb;
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 SELECT jsonb_agg(config||jsonb_build_object('updated',updated_at) ORDER BY group_code) INTO result FROM gk2_private.group_benefit_texts;
 RETURN result;
END $f$;
CREATE FUNCTION public.gk2_admin_benefit_save(p_actor text,p_key text,p_config jsonb,p_updated timestamptz)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'pg_catalog','gk2_private' AS $f$
DECLARE v_result jsonb;v_name text;v_priority integer;v_now timestamptz:=clock_timestamp();
BEGIN
 IF current_user<>'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_config IS NULL OR p_updated IS NULL OR jsonb_typeof(p_config)<>'object' THEN RAISE EXCEPTION 'invalid_benefits';END IF;
 FOREACH v_name IN ARRAY ARRAY['label','retailText','discBookingText','dartBookingText','clubNightText'] LOOP
  IF jsonb_typeof(p_config->v_name) IS DISTINCT FROM 'string' OR length(p_config->>v_name)>400 THEN RAISE EXCEPTION 'invalid_benefit_text';END IF;
 END LOOP;
 IF length(btrim(p_config->>'label'))<1 OR length(p_config->>'label')>80 THEN RAISE EXCEPTION 'invalid_label';END IF;
 FOREACH v_name IN ARRAY ARRAY['retailPriority','discBookingPriority','dartBookingPriority'] LOOP
  IF jsonb_typeof(p_config->v_name) IS DISTINCT FROM 'number' OR (p_config->>v_name)!~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'invalid_priority';END IF;
  v_priority:=(p_config->>v_name)::integer;
  IF v_priority>100 THEN RAISE EXCEPTION 'invalid_priority';END IF;
 END LOOP;
 -- Construct only permitted public fields; UI renders these as escaped plain text, never as permissions.
 v_result:=jsonb_build_object('key',p_key,'label',p_config->>'label','retailText',p_config->>'retailText',
 'discBookingText',p_config->>'discBookingText','dartBookingText',p_config->>'dartBookingText','clubNightText',p_config->>'clubNightText',
 'retailPriority',(p_config->>'retailPriority')::int,'discBookingPriority',(p_config->>'discBookingPriority')::int,'dartBookingPriority',(p_config->>'dartBookingPriority')::int);
 UPDATE gk2_private.group_benefit_texts SET config=v_result,updated_at=v_now,updated_by=lower(p_actor)
 WHERE group_code=p_key AND updated_at=p_updated;
 IF NOT FOUND THEN RAISE EXCEPTION 'benefits_changed_reload';END IF;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(lower(p_actor),'member_benefit_text_saved',p_key,jsonb_build_object('textOnly',true));
 RETURN v_result||jsonb_build_object('updated',v_now);
END $f$;
REVOKE ALL ON FUNCTION public.gk2_member_benefit_config() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_admin_benefits_list(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gk2_admin_benefit_save(text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_member_benefit_config() TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_admin_benefits_list(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gk2_admin_benefit_save(text,text,jsonb,timestamptz) TO service_role;
COMMIT;
