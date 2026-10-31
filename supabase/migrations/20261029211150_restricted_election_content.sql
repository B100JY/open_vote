begin;
alter table app_open_vote.elections add column if not exists content_restricted boolean not null default true;

-- 생성과 공개 범위 저장을 같은 트랜잭션으로 처리한다. 기존 과금·감사 생성 규칙은 재사용한다.
create or replace function app_open_vote.workspace_create_billed(
 p_args jsonb,p_public_key jsonb default null,p_key_id text default null,
 p_sms_required boolean default false,p_content_restricted boolean default true
) returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare r jsonb;
begin
 if p_content_restricted is null then raise exception 'invalid_content_policy'; end if;
 if p_public_key is not null then
  r := audit_create_billed(p_args,p_public_key,p_key_id,p_sms_required);
 else
  r := create_billed_election((p_args->>'p_creator')::uuid,p_args->>'p_name',p_args->>'p_description',
   p_args->'p_candidates',p_args->'p_voters',(p_args->>'p_unit_price')::integer,
   (p_args->>'p_starts_at')::timestamptz,(p_args->>'p_ends_at')::timestamptz,p_args->>'p_ballot_type',
   (p_args->>'p_min_choices')::integer,(p_args->>'p_max_choices')::integer,(p_args->>'p_allow_blank')::boolean);
 end if;
 if r->>'success' = 'true' then
  update elections set content_restricted=p_content_restricted where id=(r->>'election_id')::uuid;
 end if;
 return r;
end $$;
revoke execute on function app_open_vote.workspace_create_billed(jsonb,jsonb,text,boolean,boolean) from public,anon,authenticated;
grant execute on function app_open_vote.workspace_create_billed(jsonb,jsonb,text,boolean,boolean) to service_role;

drop function if exists app_open_vote.workspace_home_elections(timestamptz);
create function app_open_vote.workspace_home_elections(p_at timestamptz default now())
returns table(id uuid,name text,ends_at timestamptz,status text,closed_at timestamptz,content_restricted boolean)
language sql stable set search_path=app_open_vote,extensions as $$
 select e.id,e.name,e.ends_at,
 case when e.status='closed' or e.ends_at<=p_at then 'closed' else 'active' end,
 case when e.status='closed' then e.closed_at else e.ends_at end,e.content_restricted
 from elections e where e.trashed_at is null and (
 (e.status='active' and (e.ends_at is null or e.ends_at>p_at)) or
 (e.status in ('active','closed') and e.home_closed_days>0 and coalesce(e.closed_at,e.ends_at)<=p_at
 and coalesce(e.closed_at,e.ends_at)+e.home_closed_days*interval '24 hours'>p_at))
 order by (e.status='active' and (e.ends_at is null or e.ends_at>p_at)) desc,coalesce(e.closed_at,e.ends_at) desc nulls last,e.id;
$$;
revoke execute on function app_open_vote.workspace_home_elections(timestamptz) from public,anon,authenticated;
grant execute on function app_open_vote.workspace_home_elections(timestamptz) to service_role;
select app_open_vote.assert_permission_baseline();
commit;
