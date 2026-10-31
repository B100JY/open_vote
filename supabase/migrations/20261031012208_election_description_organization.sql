begin;
alter table app_open_vote.elections add column if not exists organization_name text not null default '' check(length(organization_name)<=120);
alter table app_open_vote.elections add column if not exists description_public boolean not null default false;

create or replace function app_open_vote.workspace_create_billed(
 p_args jsonb,p_public_key jsonb default null,p_key_id text default null,
 p_sms_required boolean default false,p_content_restricted boolean default true
) returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare r jsonb; organization text:=coalesce(p_args->>'p_organization_name','');
begin
 if p_content_restricted is null then raise exception 'invalid_content_policy'; end if;
 if length(organization)>120 or (p_args ? 'p_organization_name' and jsonb_typeof(p_args->'p_organization_name')<>'string') then raise exception 'invalid_organization'; end if;
 if p_args ? 'p_description_public' and jsonb_typeof(p_args->'p_description_public')<>'boolean' then raise exception 'invalid_description_policy'; end if;
 r := create_billed_election((p_args->>'p_creator')::uuid,p_args->>'p_name',p_args->>'p_description',
   p_args->'p_candidates',p_args->'p_voters',(p_args->>'p_unit_price')::integer,
   (p_args->>'p_starts_at')::timestamptz,(p_args->>'p_ends_at')::timestamptz,p_args->>'p_ballot_type',
   (p_args->>'p_min_choices')::integer,(p_args->>'p_max_choices')::integer,(p_args->>'p_allow_blank')::boolean);
 if r->>'success' = 'true' then
  update elections set content_restricted=p_content_restricted,organization_name=trim(organization),
   description_public=coalesce((p_args->>'p_description_public')::boolean,false) where id=(r->>'election_id')::uuid;
  if p_public_key is not null then perform audit_setup((r->>'election_id')::uuid,p_public_key,p_key_id,p_sms_required); end if;
 end if;
 return r;
end $$;
revoke execute on function app_open_vote.workspace_create_billed(jsonb,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function app_open_vote.workspace_create_billed(jsonb,jsonb,text,boolean,boolean) to service_role;
select app_open_vote.assert_permission_baseline();
commit;
