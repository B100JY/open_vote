-- 문자 발송 시점의 포인트 예약·정산. 새 투표 생성은 서버가 p_unit_price=0으로 호출한다.
begin;
create table if not exists app_open_vote.sms_dispatches (
 id uuid primary key default gen_random_uuid(),
 election_id uuid not null references app_open_vote.elections(id),
 registry_id uuid not null references app_open_vote.voter_registry(id),
 owner_id uuid not null, actor_id uuid,
 format text not null check(format in ('standard','compact')),
 kind text not null check(kind in ('bulk','admin','self')),
 price integer not null check(price>=0), charged integer not null check(charged>=0),
 rebate integer not null check(rebate>=0),
 state text not null default 'pending' check(state in ('pending','sent','failed','unknown')),
 created_at timestamptz not null default now()
);
create index if not exists sms_dispatch_election_idx on app_open_vote.sms_dispatches(election_id);
create index if not exists sms_dispatch_registry_idx on app_open_vote.sms_dispatches(registry_id,state);
create unique index if not exists sms_dispatch_inflight on app_open_vote.sms_dispatches(registry_id) where state in ('pending','unknown');
alter table app_open_vote.sms_dispatches enable row level security;
revoke all on app_open_vote.sms_dispatches from public,anon,authenticated;
grant all on app_open_vote.sms_dispatches to service_role;

-- 旧 선차감 선거에만 남은 첫 문자 크레딧을 인정한다. 신규 생성(0P)은 해당 없음.
create or replace function app_open_vote.sms_legacy_credit(p_election_id uuid,p_registry_id uuid) returns integer
language sql stable set search_path=app_open_vote,extensions as $$
 select case when v.invited_at is null and not exists(select 1 from sms_dispatches d where d.registry_id=v.id and d.state='sent')
 then coalesce((select least(2147483647,greatest(0,-t.amount / nullif(e.total_voter_codes,0)))::integer from credit_transactions t
 where t.election_id=e.id and t.user_id=e.created_by and t.tx_type='vote_creation' and t.amount<0 order by t.created_at limit 1),0)
 else 0 end
 from elections e join voter_registry v on v.election_id=e.id where e.id=p_election_id and v.id=p_registry_id;
$$;

create or replace function app_open_vote.sms_quote(p_election_id uuid,p_voter_ids uuid[],p_standard integer,p_compact integer) returns jsonb
language sql stable set search_path=app_open_vote,extensions as $$
 select jsonb_build_object('count',count(v.id),'balance',coalesce((select balance from credit_accounts where user_id=e.created_by),0),
 'standard',coalesce(sum(greatest(0,p_standard-coalesce(sms_legacy_credit(e.id,v.id),0))),0),
 'compact',coalesce(sum(greatest(0,p_compact-coalesce(sms_legacy_credit(e.id,v.id),0))),0),
 'legacyCredit',coalesce(sum(sms_legacy_credit(e.id,v.id)),0))
 from elections e left join voter_registry v on v.election_id=e.id and v.id=any(p_voter_ids) where e.id=p_election_id group by e.id;
$$;
revoke execute on function app_open_vote.sms_quote(uuid,uuid[],integer,integer) from public,anon,authenticated;
grant execute on function app_open_vote.sms_quote(uuid,uuid[],integer,integer) to service_role;

create or replace function app_open_vote.sms_reserve(p_election_id uuid,p_voter_ids uuid[],p_format text,p_kind text,p_price integer,p_actor uuid default null,p_only_uninvited boolean default false)
returns jsonb language plpgsql set search_path=app_open_vote,extensions as $$
declare e elections%rowtype; v voter_registry%rowtype; ids uuid[]; wanted integer; required bigint:=0; balance_now bigint; credit integer; d uuid; items jsonb:='[]';
begin
 if p_format not in ('standard','compact') or p_kind not in ('bulk','admin','self') or p_price is null or p_price<0 or coalesce(cardinality(p_voter_ids),0)=0 then
 return jsonb_build_object('ok',false,'error','invalid_request'); end if;
 select * into e from elections where id=p_election_id for update;
 if not found or e.status<>'active' or (e.ends_at is not null and e.ends_at<=clock_timestamp()) then return jsonb_build_object('ok',false,'error','not_active'); end if;
 if e.created_by is null then return jsonb_build_object('ok',false,'error','owner_required'); end if;
 select count(distinct x) into wanted from unnest(p_voter_ids) x;
 -- 모든 접수/정산 경로는 election → registry → account 순서로 잠근다.
 select array_agg(x.id order by x.id) into ids from (select r.id from voter_registry r where r.election_id=e.id and r.id=any(p_voter_ids)
 and not r.has_voted and r.phone is not null and (not p_only_uninvited or r.invited_at is null) order by r.id for update) x;
 if coalesce(cardinality(ids),0)<>wanted then return jsonb_build_object('ok',false,'error','targets_changed'); end if;
 if exists(select 1 from sms_dispatches where registry_id=any(ids) and state in ('pending','unknown')) then return jsonb_build_object('ok',false,'error','dispatch_pending'); end if;
 for v in select * from voter_registry where id=any(ids) order by id loop
  if p_kind='admin' and v.admin_resend_count>=5 then return jsonb_build_object('ok',false,'error','limit_reached'); end if;
  if p_kind='self' and v.self_resend_used then return jsonb_build_object('ok',false,'error','limit_reached'); end if;
  credit:=coalesce(sms_legacy_credit(e.id,v.id),0);
  required:=required+greatest(0,p_price-credit);
 end loop;
 insert into credit_accounts(user_id) values(e.created_by) on conflict(user_id) do nothing;
 select balance into balance_now from credit_accounts where user_id=e.created_by for update;
 if balance_now<required then return jsonb_build_object('ok',false,'error','insufficient_credits','balance',balance_now,'required',required); end if;
 for v in select * from voter_registry where id=any(ids) order by id loop
  credit:=coalesce(sms_legacy_credit(e.id,v.id),0);
  insert into sms_dispatches(election_id,registry_id,owner_id,actor_id,format,kind,price,charged,rebate)
  values(e.id,v.id,e.created_by,p_actor,p_format,p_kind,p_price,greatest(0,p_price-credit),greatest(0,credit-p_price)) returning id into d;
  if p_kind='admin' then update voter_registry set admin_resend_count=admin_resend_count+1 where id=v.id; end if;
  if p_kind='self' then update voter_registry set self_resend_used=true where id=v.id; end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',v.id,'dispatch',d,'resendCount',v.admin_resend_count+case when p_kind='admin' then 1 else 0 end));
 end loop;
 update credit_accounts set balance=balance-required,updated_at=now() where user_id=e.created_by;
 if required>0 then insert into credit_transactions(user_id,amount,balance_after,tx_type,election_id,memo,created_by)
 values(e.created_by,-required,balance_now-required,'sms_resend',e.id,format('문자 발송 예약: %s건 (%s)',cardinality(ids),p_format),coalesce(p_actor,e.created_by)); end if;
 return jsonb_build_object('ok',true,'items',items,'reserved',required,'balance',balance_now-required);
end $$;

create or replace function app_open_vote.sms_settle(p_id uuid,p_state text) returns jsonb
language plpgsql set search_path=app_open_vote,extensions as $$
declare d sms_dispatches%rowtype; eid uuid; rid uuid; refund integer; b bigint;
begin
 if p_state not in ('sent','failed','unknown') then raise exception 'invalid_state'; end if;
 select election_id,registry_id into eid,rid from sms_dispatches where id=p_id;
 if not found then raise exception 'dispatch_not_found'; end if;
 perform 1 from elections where id=eid for update;
 perform 1 from voter_registry where id=rid for update;
 select * into d from sms_dispatches where id=p_id for update;
 if d.state in ('sent','failed') then return jsonb_build_object('state',d.state,'refund',0); end if;
 if p_state='unknown' then update sms_dispatches set state='unknown' where id=p_id; return jsonb_build_object('state','unknown','refund',0); end if;
 refund:=case when p_state='sent' then d.rebate else d.charged end;
 if refund>0 then
 update credit_accounts set balance=balance+refund,updated_at=now() where user_id=d.owner_id returning balance into b;
 insert into credit_transactions(user_id,amount,balance_after,tx_type,election_id,memo,created_by)
 values(d.owner_id,refund,b,'refund',d.election_id,case when p_state='sent' then '선차감 문자비 차액 반환' else '문자 발송 실패 예약액 반환' end,coalesce(d.actor_id,d.owner_id));
 end if;
 if p_state='sent' then update voter_registry set invited_at=now() where id=d.registry_id;
 else
 if d.kind='admin' then update voter_registry set admin_resend_count=greatest(0,admin_resend_count-1) where id=d.registry_id; end if;
 if d.kind='self' then update voter_registry set self_resend_used=false where id=d.registry_id; end if;
 end if;
 update sms_dispatches set state=p_state where id=p_id;
 return jsonb_build_object('state',p_state,'refund',refund);
end $$;
create or replace function app_open_vote.sms_settle_many(p_items jsonb) returns jsonb
language plpgsql set search_path=app_open_vote,extensions as $$
declare item jsonb; r jsonb; total bigint:=0;
begin
 for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
 r:=sms_settle((item->>'id')::uuid,item->>'state'); total:=total+coalesce((r->>'refund')::integer,0);
 end loop;
 return jsonb_build_object('refund',total);
end $$;
revoke execute on function app_open_vote.sms_settle_many(jsonb) from public,anon,authenticated;
grant execute on function app_open_vote.sms_settle_many(jsonb) to service_role;
revoke execute on function app_open_vote.sms_legacy_credit(uuid,uuid) from public,anon,authenticated;
revoke execute on function app_open_vote.sms_reserve(uuid,uuid[],text,text,integer,uuid,boolean) from public,anon,authenticated;
revoke execute on function app_open_vote.sms_settle(uuid,text) from public,anon,authenticated;
grant execute on function app_open_vote.sms_legacy_credit(uuid,uuid), app_open_vote.sms_reserve(uuid,uuid[],text,text,integer,uuid,boolean), app_open_vote.sms_settle(uuid,text) to service_role;
select app_open_vote.assert_permission_baseline();
commit;
