-- 종료된 공개 투표의 홈 노출 기간. 선거 규칙·기표·집계에는 영향을 주지 않는다.
begin;
alter table app_open_vote.elections add column if not exists home_closed_days integer not null default 7
  check (home_closed_days between 0 and 365);
alter table app_open_vote.elections add column if not exists closed_at timestamptz;
-- 과거 기록은 정확한 수동 종료 시각이 없으므로 기존 마감일/최종 변경일로 보완한다.
update app_open_vote.elections set closed_at = least(coalesce(ends_at, updated_at, now()), now())
where status = 'closed' and closed_at is null;

create or replace function app_open_vote.workspace_stamp_closed_at() returns trigger
language plpgsql set search_path = app_open_vote, extensions as $$
begin
  if tg_op = 'UPDATE' and old.status = 'closed' then
    new.closed_at := old.closed_at;
  elsif new.status = 'closed' then
    -- 늦게 실행되는 자동 마감은 조회 시각이 아닌 원래 마감 시각을 기준으로 한다.
    new.closed_at := least(coalesce(new.ends_at, now()), now());
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function app_open_vote.workspace_stamp_closed_at() from public, anon, authenticated;
grant execute on function app_open_vote.workspace_stamp_closed_at() to service_role;
drop trigger if exists workspace_stamp_closed_at on app_open_vote.elections;
create trigger workspace_stamp_closed_at before insert or update on app_open_vote.elections
for each row execute function app_open_vote.workspace_stamp_closed_at();

create index if not exists elections_home_closed on app_open_vote.elections
((coalesce(closed_at, ends_at))) where trashed_at is null and status in ('active', 'closed');

create or replace function app_open_vote.workspace_home_elections(p_at timestamptz default now())
returns table(id uuid, name text, ends_at timestamptz, status text, closed_at timestamptz)
language sql stable set search_path = app_open_vote, extensions as $$
  select e.id, e.name, e.ends_at,
    case when e.status = 'closed' or e.ends_at <= p_at then 'closed' else 'active' end,
    case when e.status = 'closed' then e.closed_at else e.ends_at end
  from elections e
  where e.trashed_at is null and (
    (e.status = 'active' and (e.ends_at is null or e.ends_at > p_at)) or
    (e.status in ('active', 'closed') and e.home_closed_days > 0
      and coalesce(e.closed_at, e.ends_at) <= p_at
      and coalesce(e.closed_at, e.ends_at) + e.home_closed_days * interval '24 hours' > p_at)
  )
  order by (e.status = 'active' and (e.ends_at is null or e.ends_at > p_at)) desc,
    coalesce(e.closed_at, e.ends_at) desc nulls last, e.id;
$$;
revoke execute on function app_open_vote.workspace_home_elections(timestamptz) from public, anon, authenticated;
grant execute on function app_open_vote.workspace_home_elections(timestamptz) to service_role;
select app_open_vote.assert_permission_baseline();
commit;
