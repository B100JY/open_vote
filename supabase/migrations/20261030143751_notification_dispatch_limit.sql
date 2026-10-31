-- 같은 Google Chat 공간의 초당 1건 제한. 서버리스 인스턴스 간 발송도 직렬화한다.
create table if not exists app_open_vote.notification_dispatch_lock (
 id boolean primary key default true check(id), owner uuid, lease_until timestamptz not null default now()
);
insert into app_open_vote.notification_dispatch_lock(id) values(true) on conflict do nothing;
alter table app_open_vote.notification_dispatch_lock enable row level security;
revoke all on app_open_vote.notification_dispatch_lock from public,anon,authenticated;
grant all on app_open_vote.notification_dispatch_lock to service_role;
alter table app_open_vote.admin_notifications add column if not exists lease_token uuid;
create or replace function app_open_vote.claim_admin_notifications() returns setof app_open_vote.admin_notifications
language plpgsql set search_path=app_open_vote,extensions as $$
declare token uuid; claimed integer;
begin
 update admin_notifications n set state='skipped',lease_until=null
 from notification_settings s where s.id=true and n.state in ('pending','failed','sending')
 and (not s.enabled or (n.kind='signup' and not s.signup_enabled) or (n.kind='election_created' and not s.election_enabled) or (n.kind='vote_cast' and not s.vote_enabled));
 update notification_dispatch_lock set owner=gen_random_uuid(),lease_until=now()+interval '70 seconds'
 where id=true and lease_until<=now() returning owner into token;
 if token is null then return; end if;
 return query with due as (
 select id from admin_notifications where attempts<5 and next_attempt_at<=now()
 and (state in ('pending','failed') or (state='sending' and lease_until<now()))
 order by created_at limit 10 for update skip locked
 ) update admin_notifications n set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=token
 from due where n.id=due.id returning n.*;
 get diagnostics claimed = ROW_COUNT;
 if claimed=0 then update notification_dispatch_lock set owner=null,lease_until=now() where owner=token; end if;
end $$;
revoke execute on function app_open_vote.claim_admin_notifications() from public,anon,authenticated;
grant execute on function app_open_vote.claim_admin_notifications() to service_role;
create or replace function app_open_vote.release_notification_dispatch(p_token uuid) returns void
language sql set search_path=app_open_vote,extensions as $$
 update notification_dispatch_lock set owner=null,lease_until=now()+interval '1100 milliseconds' where owner=p_token;
$$;
revoke execute on function app_open_vote.release_notification_dispatch(uuid) from public,anon,authenticated;
grant execute on function app_open_vote.release_notification_dispatch(uuid) to service_role;
select app_open_vote.assert_permission_baseline();
