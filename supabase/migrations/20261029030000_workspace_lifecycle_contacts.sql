-- 휴지통/60일 보류/시작일 개정/소유자별 다중 그룹 연락처. app_open_vote만 변경.
begin;
alter table app_open_vote.elections add column if not exists trashed_at timestamptz;
alter table app_open_vote.elections add column if not exists purge_after timestamptz;
alter table app_open_vote.elections add column if not exists trash_previous_status text;
create index if not exists elections_purge_due on app_open_vote.elections(purge_after) where trashed_at is not null;
create table if not exists app_open_vote.election_objections (
 id uuid primary key default gen_random_uuid(), election_id uuid not null references app_open_vote.elections(id) on delete cascade,
 registry_id uuid not null references app_open_vote.voter_registry(id) on delete cascade,
 reason text not null check(char_length(reason) between 2 and 1000),created_at timestamptz not null default now(),unique(election_id,registry_id)
);
create table if not exists app_open_vote.contact_groups (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,name text not null check(char_length(name) between 1 and 60),unique(owner_id,name),unique(id,owner_id)
);
create table if not exists app_open_vote.contacts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,name text not null check(char_length(name) between 1 and 60),
 phone text not null check(phone ~ '^0[1-9][0-9]{7,9}$'),unique(owner_id,phone),unique(id,owner_id)
);
create table if not exists app_open_vote.contact_memberships (
 owner_id uuid not null,contact_id uuid not null,group_id uuid not null,primary key(contact_id,group_id),
 foreign key(contact_id,owner_id) references app_open_vote.contacts(id,owner_id) on delete cascade,
 foreign key(group_id,owner_id) references app_open_vote.contact_groups(id,owner_id) on delete cascade
);
alter table app_open_vote.election_objections enable row level security;
alter table app_open_vote.contact_groups enable row level security;
alter table app_open_vote.contacts enable row level security;
alter table app_open_vote.contact_memberships enable row level security;
revoke all on app_open_vote.election_objections,app_open_vote.contact_groups,app_open_vote.contacts,app_open_vote.contact_memberships from public,anon,authenticated;
grant all on app_open_vote.election_objections,app_open_vote.contact_groups,app_open_vote.contacts,app_open_vote.contact_memberships to service_role;

create or replace function app_open_vote.audit_guard_rules() returns trigger language plpgsql set search_path=app_open_vote,extensions as $$
begin
 if exists(select 1 from audit_elections where election_id=old.id) then
 if (new.name,new.description,new.candidates,new.ballot_type,new.min_choices,new.max_choices,new.allow_blank,new.ends_at,new.auth_mode,new.total_voter_codes,new.audit_version)
 is distinct from (old.name,old.description,old.candidates,old.ballot_type,old.min_choices,old.max_choices,old.allow_blank,old.ends_at,old.auth_mode,old.total_voter_codes,old.audit_version)
 and not(old.audit_version=0 and new.audit_version=1) then raise exception 'audit_rules_frozen'; end if;
 if new.starts_at is distinct from old.starts_at and current_setting('moai.schedule',true) is distinct from old.id::text then raise exception 'audit_schedule_rpc_required'; end if;
 end if;
 return new;
end $$;
revoke execute on function app_open_vote.audit_guard_rules() from public,anon,authenticated;
grant execute on function app_open_vote.audit_guard_rules() to service_role;

create or replace function app_open_vote.workspace_schedule(p_election_id uuid,p_starts_at timestamptz) returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare e elections%rowtype;
begin
 select * into e from elections where id=p_election_id for update;
 if not found or e.trashed_at is not null or e.status='closed' or p_starts_at is null or p_starts_at>=e.ends_at or p_starts_at<=clock_timestamp()
 or exists(select 1 from ballots where election_id=e.id) or exists(select 1 from voter_registry where election_id=e.id and has_voted) then raise exception 'schedule_not_changeable'; end if;
 if exists(select 1 from audit_elections where election_id=e.id) then
 perform audit_append(e.id,'schedule',jsonb_build_object('startsAt',p_starts_at));
 end if;
 perform set_config('moai.schedule',e.id::text,true);
 update elections set starts_at=p_starts_at where id=e.id;
 return jsonb_build_object('success',true);
end $$;

create or replace function app_open_vote.workspace_trash(p_election_id uuid,p_restore boolean default false) returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare e elections%rowtype;
begin
 select * into e from elections where id=p_election_id for update;
 if not found then raise exception 'not_found'; end if;
 if exists(select 1 from sms_dispatches where election_id=e.id and state in ('pending','unknown')) or exists(select 1 from audit_otp_charges where election_id=e.id and state='sending') then raise exception 'dispatch_pending'; end if;
 perform set_config('moai.lifecycle',e.id::text,true);
 if p_restore then
 update elections set trashed_at=null,purge_after=null,trash_previous_status=null,
 status=case when e.status<>'closed' and e.trash_previous_status='active' and (e.ends_at is null or e.ends_at>clock_timestamp()) then 'active' else e.status end where id=e.id;
 elsif e.trashed_at is null then
 update elections set trashed_at=clock_timestamp(),purge_after=clock_timestamp()+interval '60 days',trash_previous_status=e.status,status=case when e.status='active' then 'paused' else e.status end where id=e.id;
 end if;
 return jsonb_build_object('success',true);
end $$;

create or replace function app_open_vote.workspace_objection(p_registry_id uuid,p_reason text) returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare eid uuid;
begin
 select election_id into eid from voter_registry where id=p_registry_id;
 perform 1 from elections where id=eid for update;
 if not exists(select 1 from elections where id=eid and trashed_at is not null) then raise exception 'not_in_trash'; end if;
 insert into election_objections(election_id,registry_id,reason) values(eid,p_registry_id,trim(p_reason)) on conflict(election_id,registry_id) do nothing;
 return jsonb_build_object('success',true,'held',true);
end $$;

create or replace function app_open_vote.workspace_lifecycle_guard() returns trigger language plpgsql set search_path=app_open_vote,extensions as $$
begin
 if tg_op='DELETE' then
 if current_setting('moai.purge',true) is distinct from old.id::text or old.trashed_at is null or old.purge_after>clock_timestamp() or old.purge_after is null or exists(select 1 from election_objections where election_id=old.id) then raise exception 'trash_retention_required'; end if;
 return old;
 end if;
 if (new.trashed_at,new.purge_after,new.trash_previous_status) is distinct from (old.trashed_at,old.purge_after,old.trash_previous_status) and current_setting('moai.lifecycle',true) is distinct from old.id::text then raise exception 'lifecycle_rpc_required'; end if;
 if old.trashed_at is not null and new.status is distinct from old.status and new.status<>'closed' and current_setting('moai.lifecycle',true) is distinct from old.id::text then raise exception 'election_in_trash'; end if;
 return new;
end $$;
drop trigger if exists workspace_lifecycle_guard on app_open_vote.elections;
create trigger workspace_lifecycle_guard before update or delete on app_open_vote.elections for each row execute function app_open_vote.workspace_lifecycle_guard();
create or replace function app_open_vote.workspace_ballot_guard() returns trigger language plpgsql set search_path=app_open_vote,extensions as $$
begin
 perform 1 from elections where id=new.election_id for update;
 if exists(select 1 from elections where id=new.election_id and trashed_at is not null) then raise exception 'election_in_trash'; end if;
 return new;
end $$;
drop trigger if exists workspace_ballot_guard on app_open_vote.ballots;
create trigger workspace_ballot_guard before insert on app_open_vote.ballots for each row execute function app_open_vote.workspace_ballot_guard();

create or replace function app_open_vote.workspace_purge(p_limit integer default 25) returns integer language plpgsql set search_path=app_open_vote,extensions as $$
declare e record; removed integer:=0;
begin
 for e in select id from elections x where trashed_at is not null and purge_after<=clock_timestamp()
 and not exists(select 1 from election_objections where election_id=x.id)
 and not exists(select 1 from sms_dispatches where election_id=x.id and state in ('pending','unknown'))
 and not exists(select 1 from audit_otp_charges where election_id=x.id and state='sending')
 order by purge_after limit least(greatest(p_limit,1),100) for update skip locked loop
 perform set_config('moai.purge',e.id::text,true);
 -- 자식 자료부터 삭제하고 선거 단위의 보존 조건을 다시 검사한다.
 delete from audit_seals where election_id=e.id; delete from audit_events where election_id=e.id;
 delete from audit_elections where election_id=e.id;
 delete from audit_otp_charges where election_id=e.id; delete from sms_dispatches where election_id=e.id;
 delete from audit_otp where registry_id in (select id from voter_registry where election_id=e.id);
 delete from ballots where election_id=e.id; delete from voter_registry where election_id=e.id;
 if to_regclass('app_open_vote.audit_logs') is not null then execute 'delete from app_open_vote.audit_logs where election_id=$1' using e.id; end if;
 delete from elections where id=e.id; removed:=removed+1;
 end loop;
 return removed;
end $$;

create or replace function app_open_vote.workspace_save_contact(p_owner uuid,p_id uuid,p_name text,p_phone text,p_groups uuid[]) returns uuid language plpgsql set search_path=app_open_vote,extensions as $$
declare cid uuid; wanted integer;
begin
 select count(distinct x) into wanted from unnest(coalesce(p_groups,'{}')) x;
 if (select count(*) from contact_groups where owner_id=p_owner and id=any(coalesce(p_groups,'{}')))<>wanted then raise exception 'foreign_group'; end if;
 if p_id is null then
 insert into contacts(owner_id,name,phone) values(p_owner,trim(p_name),p_phone)
 on conflict(owner_id,phone) do update set name=excluded.name returning id into cid;
 else
 update contacts set name=trim(p_name),phone=p_phone where id=p_id and owner_id=p_owner returning id into cid;
 if cid is null then raise exception 'contact_not_found'; end if;
 end if;
 delete from contact_memberships where contact_id=cid and owner_id=p_owner;
 insert into contact_memberships(owner_id,contact_id,group_id) select p_owner,cid,x from unnest(coalesce(p_groups,'{}')) x on conflict do nothing;
 return cid;
end $$;

create or replace function app_open_vote.workspace_import_contacts(p_owner uuid,p_contacts jsonb) returns integer language plpgsql set search_path=app_open_vote,extensions as $$
declare item jsonb; saved integer:=0;
begin
 if jsonb_typeof(p_contacts)<>'array' or jsonb_array_length(p_contacts)>500 then raise exception 'invalid_contacts'; end if;
 for item in select value from jsonb_array_elements(p_contacts) loop
 perform workspace_save_contact(p_owner,(item->>'p_id')::uuid,item->>'p_name',item->>'p_phone',array(select value::uuid from jsonb_array_elements_text(item->'p_groups')));
 saved:=saved+1;
 end loop;
 return saved;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_open_vote' and p.proname like 'workspace\_%' escape '\' loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
select app_open_vote.assert_permission_baseline();
commit;
