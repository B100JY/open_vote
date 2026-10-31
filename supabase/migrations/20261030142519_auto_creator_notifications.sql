-- 생성자 자동 승인. 관리자·정지 권한은 건드리지 않는다.
alter table app_open_vote.members alter column role set default 'creator';
update app_open_vote.members set role='creator' where role='pending';

create table if not exists app_open_vote.notification_settings (
 id boolean primary key default true check(id), enabled boolean not null default true,
 signup_enabled boolean not null default true, election_enabled boolean not null default true,
 vote_enabled boolean not null default true
);
insert into app_open_vote.notification_settings(id) values(true) on conflict do nothing;
-- 기표지·명부·영수증 식별자를 보관하지 않는 운영 알림함.
create table if not exists app_open_vote.admin_notifications (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('signup','election_created','vote_cast')),
 election_id uuid, title text not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),
 created_at timestamptz not null default now(), sent_at timestamptz,
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_until timestamptz, last_error text
);
create index if not exists admin_notifications_recent on app_open_vote.admin_notifications(created_at desc);
create index if not exists admin_notifications_due on app_open_vote.admin_notifications(next_attempt_at) where state in ('pending','failed','sending');
alter table app_open_vote.notification_settings enable row level security;
alter table app_open_vote.admin_notifications enable row level security;
revoke all on app_open_vote.notification_settings, app_open_vote.admin_notifications from public,anon,authenticated;
grant all on app_open_vote.notification_settings, app_open_vote.admin_notifications to service_role;

create or replace function app_open_vote.queue_admin_notification() returns trigger
language plpgsql set search_path=app_open_vote,extensions as $$
declare k text; t text; e uuid; allowed boolean; cfg notification_settings%rowtype;
begin
 select * into strict cfg from notification_settings where id=true;
 if TG_TABLE_NAME='members' then k:='signup'; t:='새 회원이 가입했습니다'; allowed:=cfg.signup_enabled;
 elsif TG_TABLE_NAME='elections' then k:='election_created'; t:=left(NEW.name,120); e:=NEW.id; allowed:=cfg.election_enabled;
 else k:='vote_cast'; e:=NEW.election_id; select left(name,120) into t from elections where id=e; allowed:=cfg.vote_enabled;
 end if;
 insert into admin_notifications(kind,election_id,title,state)
 values(k,e,coalesce(t,'투표'),case when cfg.enabled and allowed then 'pending' else 'skipped' end);
 return NEW;
end $$;
revoke execute on function app_open_vote.queue_admin_notification() from public,anon,authenticated;
grant execute on function app_open_vote.queue_admin_notification() to service_role;
drop trigger if exists notify_member_signup on app_open_vote.members;
create trigger notify_member_signup after insert on app_open_vote.members for each row execute function app_open_vote.queue_admin_notification();
drop trigger if exists notify_election_created on app_open_vote.elections;
create trigger notify_election_created after insert on app_open_vote.elections for each row execute function app_open_vote.queue_admin_notification();
drop trigger if exists notify_vote_cast on app_open_vote.ballots;
create trigger notify_vote_cast after insert on app_open_vote.ballots for each row execute function app_open_vote.queue_admin_notification();

create or replace function app_open_vote.claim_admin_notifications() returns setof app_open_vote.admin_notifications
language plpgsql set search_path=app_open_vote,extensions as $$
begin
 -- 끄면 이미 대기 중인 알림도 발송하지 않는다. 다시 켜도 건너뛴 기록은 소급 발송하지 않는다.
 update admin_notifications n set state='skipped',lease_until=null
 from notification_settings s where s.id=true and n.state in ('pending','failed','sending')
 and (not s.enabled or (n.kind='signup' and not s.signup_enabled) or (n.kind='election_created' and not s.election_enabled) or (n.kind='vote_cast' and not s.vote_enabled));
 return query with due as (
 select id from admin_notifications where attempts<5 and next_attempt_at<=now()
 and (state in ('pending','failed') or (state='sending' and lease_until<now()))
 order by created_at limit 10 for update skip locked
 ) update admin_notifications n set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes'
 from due where n.id=due.id returning n.*;
end $$;
revoke execute on function app_open_vote.claim_admin_notifications() from public,anon,authenticated;
grant execute on function app_open_vote.claim_admin_notifications() to service_role;

create or replace function app_open_vote.finish_admin_notification(p_id uuid,p_attempt integer,p_success boolean,p_error text default null) returns void
language sql set search_path=app_open_vote,extensions as $$
 update admin_notifications set state=case when p_success then 'sent' else 'failed' end,
 sent_at=case when p_success then now() else null end,lease_until=null,
 last_error=case when p_success then null else case when p_error ~ '^(HTTP_[0-9]{3}|DELIVERY_FAILED)$' then p_error else 'DELIVERY_FAILED' end end,
 next_attempt_at=now()+interval '1 minute'*power(2,least(attempts,5))
 where id=p_id and state='sending' and attempts=p_attempt;
$$;
revoke execute on function app_open_vote.finish_admin_notification(uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function app_open_vote.finish_admin_notification(uuid,integer,boolean,text) to service_role;
select app_open_vote.assert_permission_baseline();
