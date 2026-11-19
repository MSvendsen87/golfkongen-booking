-- Source-of-truth reconstruction of isolated gk2_private price drafts.
-- Applied to existing paid golfkongen-minbag-staging on 2026-10-25.
-- NEVER run against another project without review.
-- All prices are STAGING DRAFTS (active=false), not Quickbutik live.
CREATE UNIQUE INDEX IF NOT EXISTS gk2_price_single_default ON gk2_private.price_policies(resource,group_code,minutes) WHERE valid_from IS NULL AND valid_to IS NULL;

WITH tiers(group_code,hyzr30,hyzr60,dart30,dart60) AS (
 VALUES
 ('public',9000,15000,8000,12000),
 ('betalt_medlem',5000,10000,5000,10000),
 ('teamgolfkongen',5000,10000,8000,12000),
 ('frisbee_dart',6000,12000,5000,10000),
 ('ansatte',1000,1500,1000,1500),
 ('ambassador',5000,10000,8000,12000),
 ('frisbeeklubb',6000,12000,8000,12000),
 ('dartklubb',9000,15000,5000,10000)
), expanded AS (
 SELECT t.group_code,r.resource,m.minutes,
 ((m.minutes/60)*CASE WHEN r.resource='hyzr' THEN t.hyzr60 ELSE t.dart60 END +
 ((m.minutes%60)/30)*CASE WHEN r.resource='hyzr' THEN t.hyzr30 ELSE t.dart30 END)::integer AS calculated_ore
 FROM tiers t CROSS JOIN (VALUES ('hyzr'),('dart_a'),('dart_b')) r(resource)
 CROSS JOIN LATERAL generate_series(30,240,30) m(minutes)
)
INSERT INTO gk2_private.price_policies(resource,group_code,minutes,price_ore,valid_from,valid_to,active,notes,changed_by)
SELECT resource,group_code,minutes,calculated_ore,NULL,NULL,false,
'Godkjent grunnregel for 30/60 min; øvrig varighet utledet av hele timer + 30 min. Ingen Quickbutik-prissynk ennå.','post@golfkongen.no'
FROM expanded
ON CONFLICT(resource,group_code,minutes) WHERE valid_from IS NULL AND valid_to IS NULL DO NOTHING;

WITH groups(group_code) AS (
 VALUES ('public'),('betalt_medlem'),('teamgolfkongen'),('frisbee_dart'),
 ('ansatte'),('ambassador'),('frisbeeklubb'),('dartklubb')
)
INSERT INTO gk2_private.price_policies(resource,group_code,minutes,price_ore,valid_from,valid_to,active,notes,changed_by)
SELECT 'venue',g.group_code,60*h.n,
CASE WHEN g.group_code='ansatte' THEN 2000+1000*(h.n-4)
ELSE 80000+20000*(h.n-4) END,NULL,NULL,false,
CASE WHEN g.group_code='ansatte' THEN 'Ansatte: 4 timer 20 kr + 10 kr per ekstra HEL time'
ELSE 'Standardleie: 4 timer 800 kr + 200 kr per ekstra HEL time; egen gruppepris kan endres i admin' END,
'post@golfkongen.no'
FROM groups g CROSS JOIN generate_series(4,12,1) h(n)
ON CONFLICT(resource,group_code,minutes) WHERE valid_from IS NULL AND valid_to IS NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.gk2_admin_price_matrix(p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE result jsonb;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'resource',resource,'group',group_code,'minutes',minutes,'ore',price_ore,'active',active,
  'notes',coalesce(notes,''),'updated',changed_at) ORDER BY group_code,resource,minutes),'[]'::jsonb)
 INTO result FROM gk2_private.price_policies WHERE valid_from IS NULL AND valid_to IS NULL;
 RETURN result;
END; $function$;
REVOKE ALL ON FUNCTION public.gk2_admin_price_matrix(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_price_matrix(text) TO service_role;

CREATE OR REPLACE FUNCTION public.gk2_admin_save_price(p_actor text, p_resource text, p_group text, p_minutes integer, p_price_ore integer, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'gk2_private'
AS $function$
DECLARE v_id uuid; v_changed integer;
BEGIN
 IF current_user <> 'service_role' OR NOT public.gk2_is_admin(p_actor) THEN RAISE EXCEPTION 'admin_forbidden';END IF;
 IF p_resource NOT IN ('hyzr','dart_a','dart_b','venue')
   OR p_group NOT IN ('public','betalt_medlem','teamgolfkongen','frisbee_dart','ansatte','ambassador','frisbeeklubb','dartklubb')
   OR p_minutes IS NULL OR p_price_ore IS NULL OR p_price_ore < 0 OR p_price_ore > 10000000
   OR (p_resource='venue' AND (p_minutes<240 OR p_minutes>720 OR p_minutes%60<>0))
   OR (p_resource<>'venue' AND (p_minutes<30 OR p_minutes>240 OR p_minutes%30<>0))
   OR length(coalesce(p_note,''))>500
 THEN RAISE EXCEPTION 'invalid_price_rule'; END IF;
 INSERT INTO gk2_private.price_policies(resource,group_code,minutes,price_ore,valid_from,valid_to,active,notes,changed_by,changed_at)
 VALUES(p_resource,p_group,p_minutes,p_price_ore,NULL,NULL,false,left(coalesce(p_note,''),500),p_actor,now())
 ON CONFLICT(resource,group_code,minutes) WHERE valid_from IS NULL AND valid_to IS NULL
 DO UPDATE SET price_ore=excluded.price_ore,notes=excluded.notes,active=false,
               changed_by=excluded.changed_by,changed_at=now()
 RETURNING id INTO v_id;
 INSERT INTO gk2_private.audit_events(actor,action,resource_id,payload)
 VALUES(p_actor,'price_draft_saved',v_id::text,
 jsonb_build_object('resource',p_resource,'group',p_group,'minutes',p_minutes,'ore',p_price_ore,'quickbutik_updated',false));
 RETURN jsonb_build_object('id',v_id,'resource',p_resource,'group',p_group,'minutes',p_minutes,
     'priceOre',p_price_ore,'active',false,'quickbutikUpdated',false);
END;$function$;
REVOKE ALL ON FUNCTION public.gk2_admin_save_price(text,text,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gk2_admin_save_price(text,text,text,integer,integer,text) TO service_role;
