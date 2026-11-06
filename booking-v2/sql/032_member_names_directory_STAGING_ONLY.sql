-- Booking 2.0 – private membership directory (2026-10-28)
-- Applied to staging already. Re-running this file is idempotent.
-- This records names for verified manual Quickbutik group assignments.
-- It NEVER changes Quickbutik customers, groups, discounts or booking prices.

create table if not exists gk2_private.member_names (
 email text primary key,
 full_name text not null check (char_length(full_name) between 2 and 120),
 updated_by text not null,
 updated_at timestamptz not null default now(),
 constraint gk2_member_names_email_lc check (
  email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
alter table gk2_private.member_names enable row level security;
revoke all on gk2_private.member_names from public,anon,authenticated;
grant select,insert,update on gk2_private.member_names to service_role;

create or replace function public.gk2_admin_member_directory(p_actor text)
returns jsonb language plpgsql
set search_path='pg_catalog','gk2_private'
as $fn$
declare v_result jsonb;
begin
 if current_user <> 'service_role' or not public.gk2_is_admin(p_actor)
 then raise exception 'admin_forbidden'; end if;
 with latest as (
  select distinct on (lower(btrim(requested_email)),group_code)
   lower(btrim(requested_email)) email,group_code,action,created_at,id
  from gk2_private.membership_changes
  where state='verified'
  order by lower(btrim(requested_email)),group_code,created_at desc,id desc
 ), active as (
  select l.email,l.group_code,n.full_name
  from latest l left join gk2_private.member_names n on n.email=l.email
  where l.action='add'
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'email',email,'group',group_code,'name',coalesce(full_name,''))
  order by group_code,coalesce(full_name,email),email),'[]'::jsonb)
 into v_result from active;
 return v_result;
end;$fn$;

create or replace function public.gk2_admin_member_name_save(
 p_actor text,p_email text,p_full_name text
) returns jsonb language plpgsql
set search_path='pg_catalog','gk2_private'
as $fn$
declare v_email text:=lower(btrim(coalesce(p_email,'')));
        v_name text:=btrim(coalesce(p_full_name,''));
begin
 if current_user <> 'service_role' or not public.gk2_is_admin(p_actor)
 then raise exception 'admin_forbidden'; end if;
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or length(v_email)>254 or length(v_name)<2 or length(v_name)>120
 or v_name ~ '[[:cntrl:]]' then
  raise exception 'invalid_member_identity';
 end if;
 if not exists (select 1 from gk2_private.membership_changes m
   where lower(btrim(m.requested_email))=v_email)
 then raise exception 'member_email_not_registered'; end if;
 insert into gk2_private.member_names(email,full_name,updated_by)
 values(v_email,v_name,p_actor)
 on conflict (email) do update set full_name=excluded.full_name,
 updated_by=excluded.updated_by,updated_at=now();
 return jsonb_build_object('email',v_email,'name',v_name,'saved',true);
end;$fn$;

revoke all on function public.gk2_admin_member_directory(text) from public,anon,authenticated;
revoke all on function public.gk2_admin_member_name_save(text,text,text) from public,anon,authenticated;
grant execute on function public.gk2_admin_member_directory(text) to service_role;
grant execute on function public.gk2_admin_member_name_save(text,text,text) to service_role;
