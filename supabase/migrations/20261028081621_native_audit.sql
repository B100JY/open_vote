-- 모아이 경량 감사. 운영에는 별도 승인 후 적용한다. 기존 선거는 자동 변환하지 않는다.
begin;
alter table app_open_vote.elections add column if not exists audit_version integer not null default 0;
create table if not exists app_open_vote.audit_elections (
 election_id uuid primary key references app_open_vote.elections(id) on delete restrict,
 manifest jsonb not null, manifest_hash text not null check(manifest_hash ~ '^[a-f0-9]{64}$'),
 head text not null, height integer not null default 0, final_event jsonb,
 sms_sends integer not null default 0
);
create table if not exists app_open_vote.audit_events (
 election_id uuid not null references app_open_vote.audit_elections(election_id),
 index integer not null, commitment text, event jsonb not null,
 primary key(election_id,index), unique(election_id,commitment)
);
create table if not exists app_open_vote.audit_seals (
 election_id uuid not null references app_open_vote.audit_elections(election_id),
 index integer not null, envelope jsonb not null, primary key(election_id,index)
);
create table if not exists app_open_vote.audit_otp_charges (
 challenge uuid primary key, registry_id uuid not null references app_open_vote.voter_registry(id),
 owner_id uuid not null, election_id uuid not null, price integer not null check(price>0), state text not null default 'sending' check(state in ('sending','sent','failed'))
);
alter table app_open_vote.audit_otp_charges enable row level security;
revoke all on app_open_vote.audit_otp_charges from public,anon,authenticated;
grant all on app_open_vote.audit_otp_charges to service_role;

-- 인증 자료만 보관한다. 표/영수증/약정 식별자는 넣지 않는다.
create table if not exists app_open_vote.audit_otp (
 registry_id uuid primary key references app_open_vote.voter_registry(id) on delete cascade,
 challenge uuid not null, code_hash text not null, grant_hash text,
 expires_at timestamptz not null, sent_at timestamptz not null,
 failures integer not null default 0, sends integer not null default 0,
 ready boolean not null default false, consumed boolean not null default false
);
alter table app_open_vote.audit_elections enable row level security;
alter table app_open_vote.audit_events enable row level security;
alter table app_open_vote.audit_seals enable row level security;
alter table app_open_vote.audit_otp enable row level security;
revoke all on app_open_vote.audit_elections,app_open_vote.audit_events,app_open_vote.audit_seals,app_open_vote.audit_otp from public,anon,authenticated;
grant all on app_open_vote.audit_elections,app_open_vote.audit_events,app_open_vote.audit_seals,app_open_vote.audit_otp to service_role;

-- 감사 스키마는 ASCII 필드명·정수만 사용한다. 사용자 문자열은 JSON 표준 escaping.
create or replace function app_open_vote.audit_canonical(v jsonb) returns text
language plpgsql immutable set search_path = app_open_vote,extensions as $$
declare r text;
begin
 case jsonb_typeof(v)
 when 'object' then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||audit_canonical(value),',' order by key collate "C"),'')||'}' into r from jsonb_each(v);
 when 'number' then r:=to_jsonb((v#>>'{}')::double precision)::text;
 when 'array' then select '['||coalesce(string_agg(audit_canonical(value),',' order by n),'')||']' into r from jsonb_array_elements(v) with ordinality t(value,n);
 else r := v::text;
 end case;
 return r;
end $$;
create or replace function app_open_vote.audit_hash(v jsonb) returns text language sql immutable set search_path = app_open_vote,extensions as $$ select encode(digest(convert_to(audit_canonical(v),'UTF8'),'sha256'),'hex') $$;

create or replace function app_open_vote.audit_setup(p_election_id uuid,p_public_key jsonb,p_key_id text,p_sms_required boolean default false)
returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare e elections%rowtype; m jsonb; h text;
begin
 select * into e from elections where id=p_election_id for update;
 if not found then raise exception 'election_not_found'; end if;
 if exists(select 1 from audit_elections where election_id=e.id) then return (select manifest from audit_elections where election_id=e.id); end if;
 if e.status not in ('draft','active') or exists(select 1 from ballots where election_id=e.id) then raise exception 'audit_setup_requires_empty_election'; end if;
 if p_public_key->>'kty' <> 'EC' or p_public_key->>'crv' <> 'P-256' or p_public_key ? 'd' or p_key_id is null then raise exception 'invalid_public_key'; end if;
 if p_sms_required and exists(select 1 from voter_registry where election_id=e.id and (phone is null or phone='')) then raise exception 'otp_requires_registered_phone'; end if;
 m := jsonb_build_object('format','moai-manifest-v1','election',jsonb_build_object(
 'id',e.id,'name',e.name,'description',e.description,'candidates',e.candidates,'ballot_type',e.ballot_type,
 'min_choices',e.min_choices,'max_choices',e.max_choices,'allow_blank',e.allow_blank,
 'starts_at',e.starts_at,'ends_at',e.ends_at),'electorate',(select count(*) from voter_registry where election_id=e.id),
 'smsRequired',p_sms_required,'singleCast',true,'publicKey',p_public_key,'keyId',p_key_id);
 h:=audit_hash(m);
 insert into audit_elections(election_id,manifest,manifest_hash,head) values(e.id,m,h,h);
 update elections set audit_version=1 where id=e.id;
 return m;
end $$;

-- 감사 선거의 규칙/정원은 setup 이후 고정. 토큰 회전·참여 표시는 허용한다.
create or replace function app_open_vote.audit_guard_rules() returns trigger language plpgsql set search_path = app_open_vote,extensions as $$
begin
 if exists(select 1 from audit_elections where election_id=old.id) and
 (new.name,new.description,new.candidates,new.ballot_type,new.min_choices,new.max_choices,new.allow_blank,new.starts_at,new.ends_at,new.auth_mode,new.total_voter_codes,new.audit_version)
 is distinct from (old.name,old.description,old.candidates,old.ballot_type,old.min_choices,old.max_choices,old.allow_blank,old.starts_at,old.ends_at,old.auth_mode,old.total_voter_codes,old.audit_version)
 and not(old.audit_version=0 and new.audit_version=1) then raise exception 'audit_rules_frozen'; end if;
 return new;
end $$;
drop trigger if exists audit_guard_rules on app_open_vote.elections;
create trigger audit_guard_rules before update on app_open_vote.elections for each row execute function app_open_vote.audit_guard_rules();
create or replace function app_open_vote.audit_guard_registry() returns trigger language plpgsql set search_path = app_open_vote,extensions as $$
declare eid uuid;
begin
 eid:=case when tg_op='INSERT' then new.election_id else old.election_id end;
 if exists(select 1 from audit_elections where election_id=eid) then
 if tg_op in ('INSERT','DELETE') then raise exception 'audit_registry_frozen'; end if;
 if (new.election_id,new.phone,new.email,new.auth_user_id) is distinct from (old.election_id,old.phone,old.email,old.auth_user_id) then raise exception 'audit_registry_frozen'; end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists audit_guard_registry on app_open_vote.voter_registry;
create trigger audit_guard_registry before insert or update or delete on app_open_vote.voter_registry for each row execute function app_open_vote.audit_guard_registry();

create or replace function app_open_vote.audit_append(p_election_id uuid,p_kind text,p_payload jsonb) returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare a audit_elections%rowtype; ev jsonb; h text;
begin
 select * into a from audit_elections where election_id=p_election_id for update;
 if a.final_event is not null then raise exception 'audit_closed'; end if;
 ev:=jsonb_build_object('format','moai-event-v1','electionId',p_election_id,'manifestHash',a.manifest_hash,'index',a.height+1,'kind',p_kind,'payload',p_payload,'previous',a.head);
 h:=audit_hash(ev); ev:=ev||jsonb_build_object('head',h);
 insert into audit_events values(p_election_id,a.height+1,case when p_kind='vote' then p_payload->>'commitment' end,ev);
 update audit_elections set head=h,height=a.height+1,final_event=case when p_kind='final' then ev end where election_id=p_election_id;
 return ev;
end $$;

-- 레거시 내부 함수/직접 INSERT도 감사 선거에서는 우회할 수 없다.
create or replace function app_open_vote.audit_ballot_guard() returns trigger language plpgsql set search_path = app_open_vote,extensions as $$
declare c text;
begin
 if exists(select 1 from audit_elections where election_id=new.election_id) then
 c:=current_setting('moai.commitment',true);
 if c is null or c !~ '^[a-f0-9]{64}$' or current_setting('moai.election',true) is distinct from new.election_id::text then raise exception 'audit_context_required'; end if;
 perform audit_append(new.election_id,'vote',jsonb_build_object('commitment',c));
 end if;
 return new;
end $$;
drop trigger if exists audit_ballot_guard on app_open_vote.ballots;
create trigger audit_ballot_guard before insert on app_open_vote.ballots for each row execute function app_open_vote.audit_ballot_guard();

-- 단일 서비스 경로: 선거 → 명부 → 인증 순서로 잠근다. 신원-표 연결은 저장하지 않는다.
create or replace function app_open_vote.audit_cast(p_registry_id uuid,p_selection jsonb,p_receipt_hash text,p_commitment text,p_manifest_hash text,p_grant_hash text default null,p_user_id uuid default null)
returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare r voter_registry%rowtype; e elections%rowtype; a audit_elections%rowtype; o audit_otp%rowtype; n jsonb; ev jsonb; result jsonb;
begin
 select * into r from voter_registry where id=p_registry_id;
 if not found then return jsonb_build_object('success',false,'error','not_registered'); end if;
 select * into e from elections where id=r.election_id for update;
 select * into r from voter_registry where id=p_registry_id for update;
 select * into a from audit_elections where election_id=e.id for update;
 if not found then raise exception 'audit_not_enabled'; end if;
 if p_manifest_hash is distinct from a.manifest_hash or p_commitment is null or p_commitment !~ '^[a-f0-9]{64}$' then return jsonb_build_object('success',false,'error','manifest_mismatch'); end if;
 -- 공개 이벤트 존재와 본인 재투표 성공은 별개다. 비밀·대응은 반환하지 않는다.
 select event into ev from audit_events where election_id=e.id and commitment=p_commitment;
 if ev is not null then return jsonb_build_object('success',false,'error','public_event_exists','event',ev); end if;
 if r.has_voted then return jsonb_build_object('success',false,'error','already_voted'); end if;
 if r.token_expires_at is not null and r.token_expires_at < clock_timestamp() then return jsonb_build_object('success',false,'error','token_expired'); end if;
 if e.status<>'active' or (e.starts_at is not null and e.starts_at>clock_timestamp()) or (e.ends_at is not null and e.ends_at<=clock_timestamp()) then return jsonb_build_object('success',false,'error','election_not_active'); end if;
 if (a.manifest->>'smsRequired')::boolean then
 select * into o from audit_otp where registry_id=r.id for update;
 if not found or not o.ready or o.consumed or o.expires_at<=clock_timestamp() or o.grant_hash is null or o.grant_hash is distinct from p_grant_hash then return jsonb_build_object('success',false,'error','sms_auth_required'); end if;
 end if;
 n:=normalize_ballot_selection(e.candidates,e.ballot_type,e.min_choices,e.max_choices,e.allow_blank,p_selection);
 if not (n->>'ok')::boolean then return jsonb_build_object('success',false,'error',n->>'error','message',n->>'message'); end if;
 if p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('success',false,'error','invalid_receipt'); end if;
 if exists(select 1 from ballots where election_id=e.id and receipt_hash=p_receipt_hash) then return jsonb_build_object('success',false,'error','duplicate_receipt'); end if;
 perform set_config('moai.election',e.id::text,true);
 perform set_config('moai.commitment',p_commitment,true);
 -- 기존 내부 함수가 규칙 검증·투표지·참여 표시를 같은 트랜잭션으로 처리한다.
 result:=cast_ballot_internal(e.id,r.id,p_user_id,p_selection,p_receipt_hash)::jsonb;
 if (result->>'success')::boolean then
 update audit_otp set consumed=true where registry_id=r.id;
 select event into ev from audit_events where election_id=e.id and commitment=p_commitment;
 return jsonb_build_object('success',true,'receipt_hash',p_receipt_hash,'event',ev);
 end if;
 return result-'selection';
end $$;

create or replace function app_open_vote.audit_close_guard() returns trigger language plpgsql set search_path = app_open_vote,extensions as $$
declare a audit_elections%rowtype; l jsonb; res jsonb; cs jsonb;
begin
 if new.status='closed' and old.status<>'closed' then
 select * into a from audit_elections where election_id=new.id for update;
 if found then
 -- AFTER 트리거에서 closed 원장/결과를 읽는다. 선거 행 잠금으로 기표와 직렬화된다.
 l:=get_public_ballot_ledger(new.id)::jsonb; res:=get_election_results(new.id)::jsonb-'success';
 select coalesce(jsonb_agg(commitment order by commitment collate "C"),'[]') into cs from audit_events where election_id=new.id and commitment is not null;
 if (l->>'ballot_count')::integer<>jsonb_array_length(cs) then raise exception 'audit_count_mismatch'; end if;
 perform audit_append(new.id,'final',jsonb_build_object('ledgerHash',l->>'ledger_hash','commitmentHash',audit_hash(cs),'ballotCount',(l->>'ballot_count')::integer,'resultHash',audit_hash(res)));
 end if;
 end if;
 return new;
end $$;
drop trigger if exists audit_close_guard on app_open_vote.elections;
create trigger audit_close_guard after update on app_open_vote.elections for each row execute function app_open_vote.audit_close_guard();

-- 최초 확정 서명을 저장하고 재조회 때 다른 내용으로 교체하지 않는다.
create or replace function app_open_vote.audit_save_seal(p_election_id uuid,p_index integer,p_envelope jsonb) returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare expected jsonb;
begin
 if p_index=0 then select manifest into expected from audit_elections where election_id=p_election_id;
 else select event into expected from audit_events where election_id=p_election_id and index=p_index; end if;
 if expected is null or expected is distinct from p_envelope->'payload' or p_envelope->>'signature' !~ '^[a-f0-9]{128}$' then raise exception 'uncommitted_seal'; end if;
 insert into audit_seals values(p_election_id,p_index,p_envelope) on conflict do nothing;
 return (select envelope from audit_seals where election_id=p_election_id and index=p_index);
end $$;

-- OTP: DB에는 해시만 보관. 재발송은 실패 횟수를 초기화하지 않는다.
create or replace function app_open_vote.audit_otp_issue(p_registry_id uuid,p_challenge uuid,p_code_hash text,p_price integer default 1) returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare r voter_registry%rowtype; e elections%rowtype; a audit_elections%rowtype; o audit_otp%rowtype; b bigint;
begin
 select * into r from voter_registry where id=p_registry_id;
 select * into e from elections where id=r.election_id for update;
 select * into a from audit_elections where election_id=e.id for update;
 select * into o from audit_otp where registry_id=r.id for update;
 if r.id is null or r.has_voted or e.status<>'active' or e.ends_at<=clock_timestamp() or e.starts_at>clock_timestamp() or r.token_expires_at<clock_timestamp() or not coalesce((a.manifest->>'smsRequired')::boolean,false) or r.phone is null then return jsonb_build_object('ok',false,'error','not_available'); end if;
 if o.sent_at>clock_timestamp()-interval '60 seconds' or o.failures>=5 or o.sends>=5 or a.sms_sends>=greatest((a.manifest->>'electorate')::integer*3,1) then return jsonb_build_object('ok',false,'error','otp_limited'); end if;
 if p_price<1 or p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_otp_request'; end if;
 select balance into b from credit_accounts where user_id=e.created_by for update;
 if b is null or b<p_price then return jsonb_build_object('ok',false,'error','insufficient_credits'); end if;
 update credit_accounts set balance=balance-p_price where user_id=e.created_by;
 insert into credit_transactions(user_id,amount,balance_after,tx_type,election_id,memo,created_by) values(e.created_by,-p_price,b-p_price,'sms_resend',e.id,'기표 문자 인증',e.created_by);
 insert into audit_otp(registry_id,challenge,code_hash,expires_at,sent_at,sends) values(r.id,p_challenge,p_code_hash,clock_timestamp()+interval '5 minutes',clock_timestamp(),1)
 on conflict(registry_id) do update set challenge=excluded.challenge,code_hash=excluded.code_hash,grant_hash=null,expires_at=excluded.expires_at,sent_at=excluded.sent_at,sends=audit_otp.sends+1,ready=false,consumed=false;
 insert into audit_otp_charges(challenge,registry_id,owner_id,election_id,price) values(p_challenge,r.id,e.created_by,e.id,p_price);
 update audit_elections set sms_sends=sms_sends+1 where election_id=e.id;
 return jsonb_build_object('ok',true,'phone',r.phone,'challenge',p_challenge);
end $$;
-- 제공자가 확실하게 실패를 반환한 건만 한 번 환불한다. 타임아웃은 자동 환불/재발송하지 않는다.
create or replace function app_open_vote.audit_otp_settle(p_challenge uuid,p_sent boolean) returns void language plpgsql set search_path = app_open_vote,extensions as $$
declare c audit_otp_charges%rowtype; b bigint;
begin
 select * into c from audit_otp_charges where challenge=p_challenge for update;
 if not found or c.state<>'sending' then return; end if;
 if p_sent then
 update audit_otp_charges set state='sent' where challenge=p_challenge;
 update audit_otp set ready=true where registry_id=c.registry_id and challenge=p_challenge;
 else
 update audit_otp_charges set state='failed' where challenge=p_challenge;
 update credit_accounts set balance=balance+c.price where user_id=c.owner_id returning balance into b;
 insert into credit_transactions(user_id,amount,balance_after,tx_type,election_id,memo,created_by) values(c.owner_id,c.price,b,'refund',c.election_id,'문자 인증 발송 실패 환불',c.owner_id);
 end if;
end $$;
create or replace function app_open_vote.audit_otp_confirm(p_registry_id uuid,p_challenge uuid,p_code_hash text,p_grant_hash text) returns boolean language plpgsql set search_path = app_open_vote,extensions as $$
declare o audit_otp%rowtype;
begin
 select * into o from audit_otp where registry_id=p_registry_id for update;
 if not found or o.challenge<>p_challenge or not o.ready or o.consumed or o.failures>=5 or o.expires_at<=clock_timestamp() then return false; end if;
 if o.grant_hash is not null then return o.grant_hash=p_grant_hash; end if;
 if o.code_hash is distinct from p_code_hash then update audit_otp set failures=failures+1 where registry_id=p_registry_id; return false; end if;
 update audit_otp set grant_hash=p_grant_hash,code_hash='',expires_at=clock_timestamp()+interval '5 minutes' where registry_id=p_registry_id;
 return true;
end $$;

create or replace function app_open_vote.audit_create_billed(p_args jsonb,p_public_key jsonb,p_key_id text,p_sms_required boolean default false) returns jsonb language plpgsql set search_path = app_open_vote,extensions as $$
declare r jsonb;
begin
 r:=create_billed_election((p_args->>'p_creator')::uuid,p_args->>'p_name',p_args->>'p_description',p_args->'p_candidates',p_args->'p_voters',(p_args->>'p_unit_price')::integer,(p_args->>'p_starts_at')::timestamptz,(p_args->>'p_ends_at')::timestamptz,p_args->>'p_ballot_type',(p_args->>'p_min_choices')::integer,(p_args->>'p_max_choices')::integer,(p_args->>'p_allow_blank')::boolean)::jsonb;
 if (r->>'success')::boolean then perform audit_setup((r->>'election_id')::uuid,p_public_key,p_key_id,p_sms_required); end if;
 return r;
end $$;

-- 감사 선거의 기록은 서비스 경로에서도 수정/삭제하지 않는다.
create or replace function app_open_vote.audit_immutable_ballot() returns trigger language plpgsql set search_path = app_open_vote,extensions as $$
begin
 if exists(select 1 from audit_elections where election_id=old.election_id) then raise exception 'audit_ballot_immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists audit_immutable_ballot on app_open_vote.ballots;
create trigger audit_immutable_ballot before update or delete on app_open_vote.ballots for each row execute function app_open_vote.audit_immutable_ballot();

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_open_vote' and p.proname like 'audit\_%' escape '\' loop
 execute format('revoke execute on function %s from public, anon, authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
select app_open_vote.assert_permission_baseline();
commit;
