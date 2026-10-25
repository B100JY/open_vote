-- =====================================================================
-- 투표 코드 · 유권자 본인 1회 재발송 · 문자 제목 (2026-10-25)
--
-- 1) 투표 코드: 문자 링크를 누르기 꺼리는 유권자가 vote.bluerdot.net 에서 6자 코드를
--    직접 입력해 투표한다. 원문은 문자에만, DB 에는 HMAC(서버 pepper) 값만 둔다.
--    링크 토큰과 같은 명부 행을 가리키므로 어느 쪽으로 투표해도 1인 1표.
--    재발송(회전) 때 토큰과 함께 바뀌고, 발송 실패 시 함께 되돌린다.
-- 2) 본인 재발송: 코드를 잃어버린 유권자가 사이트에서 자기 번호를 넣으면 1회에 한해
--    새 링크·코드를 다시 보낸다. 비용은 선거 생성자 포인트에서 차감(부족하면 보내지 않음),
--    발송이 실패하면 환불한다. 원장 메모에 유권자 정보를 남기지 않는다.
-- 3) 문자 제목: 생성자가 고칠 수 있는 유일한 문구(30자). 본문 템플릿은 notifier 관리자만 고친다.
--
-- 비밀투표: 새 값은 모두 명부(voter_registry)에만 있다. ballots 는 건드리지 않는다.
-- =====================================================================

alter table app_open_vote.voter_registry add column if not exists code_hash text;
alter table app_open_vote.voter_registry add column if not exists self_resend_used boolean not null default false;
create unique index if not exists voter_registry_code_hash_key
    on app_open_vote.voter_registry (code_hash) where code_hash is not null;
comment on column app_open_vote.voter_registry.code_hash is '투표 코드 HMAC-SHA256(서버 pepper) hex. 원문은 문자에만';
comment on column app_open_vote.voter_registry.self_resend_used is '유권자 본인 재발송(1회) 사용 여부';

alter table app_open_vote.elections add column if not exists sms_title text;
alter table app_open_vote.elections drop constraint if exists elections_sms_title_check;
alter table app_open_vote.elections add constraint elections_sms_title_check
    check (sms_title is null or char_length(sms_title) between 1 and 30);
comment on column app_open_vote.elections.sms_title is '안내 문자 제목(생성자 편집, 비우면 "<선거명> 투표 안내")';

-- 거래 유형에 sms_resend 추가(이름이 환경마다 다를 수 있어 tx_type 검사 제약을 찾아 교체)
do $$
declare
    v_name text;
begin
    for v_name in
        select conname from pg_constraint
         where conrelid = 'app_open_vote.credit_transactions'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) like '%tx_type%'
    loop
        execute format('alter table app_open_vote.credit_transactions drop constraint %I', v_name);
    end loop;
end $$;
alter table app_open_vote.credit_transactions add constraint credit_transactions_tx_type_check
    check (tx_type in ('charge', 'vote_creation', 'refund', 'admin_adjust', 'sms_resend'));

-- ---------------------------------------------------------------------
-- 토큰 회전 / 되돌리기 — 코드 해시를 함께 다룬다(시그니처는 그대로)
--   회전: items [{id, hash, code_hash?}] → [{id, previous_hash, previous_code_hash}]
--   되돌리기: items [{id, hash, previous_hash, previous_code_hash}]
--   코드 해시가 다른 행과 겹치면 unique_violation 이 그대로 올라간다(호출 측이 새 코드로 재시도).
-- ---------------------------------------------------------------------
create or replace function app_open_vote.rotate_voter_tokens(p_election_id uuid, p_tokens jsonb)
returns jsonb
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_previous jsonb;
begin
    if p_election_id is null or p_tokens is null or jsonb_typeof(p_tokens) <> 'array' then
        return '[]'::jsonb;
    end if;

    with t as (
        select (item ->> 'id')::uuid as id
          from jsonb_array_elements(p_tokens) item
         where item ->> 'hash' ~ '^[a-f0-9]{64}$'
    ), locked as (
        select vr.id, vr.token_hash, vr.code_hash
          from voter_registry vr join t on t.id = vr.id
         where vr.election_id = p_election_id and vr.has_voted = false
         for update of vr
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'previous_hash', token_hash,
                                                 'previous_code_hash', code_hash)), '[]'::jsonb)
      into v_previous
      from locked;

    update voter_registry vr
       set token_hash = t.hash,
           code_hash = case when t.code_hash ~ '^[a-f0-9]{64}$' then t.code_hash else vr.code_hash end
      from (select (item ->> 'id')::uuid as id, item ->> 'hash' as hash, item ->> 'code_hash' as code_hash
              from jsonb_array_elements(p_tokens) item
             where item ->> 'hash' ~ '^[a-f0-9]{64}$') t
     where vr.id = t.id and vr.election_id = p_election_id and vr.has_voted = false;

    return v_previous;
end;
$$;

create or replace function app_open_vote.restore_voter_tokens(p_election_id uuid, p_tokens jsonb)
returns integer
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_count integer;
begin
    if p_election_id is null or p_tokens is null or jsonb_typeof(p_tokens) <> 'array' then
        return 0;
    end if;

    update voter_registry vr
       set token_hash = t.previous_hash,
           code_hash = t.previous_code_hash
      from (select (item ->> 'id')::uuid as id, item ->> 'hash' as hash,
                   item ->> 'previous_hash' as previous_hash,
                   item ->> 'previous_code_hash' as previous_code_hash
              from jsonb_array_elements(p_tokens) item) t
     where vr.id = t.id
       and vr.election_id = p_election_id
       and vr.token_hash = t.hash;
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 코드로 기표 — 해시는 서버(pepper 보유)가 계산해 넘긴다
-- ---------------------------------------------------------------------
create or replace function app_open_vote.cast_code_ballot(
    p_code_hash text,
    p_selection jsonb,
    p_receipt_hash text
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_registry voter_registry%rowtype;
begin
    if p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then
        return json_build_object('success', false, 'error', 'invalid_token', 'message', '투표 코드가 올바르지 않습니다.');
    end if;

    select * into v_registry from voter_registry where code_hash = p_code_hash;
    if not found then
        return json_build_object('success', false, 'error', 'invalid_token', 'message', '투표 코드가 올바르지 않습니다.');
    end if;

    if v_registry.token_expires_at is not null and v_registry.token_expires_at < now() then
        return json_build_object('success', false, 'error', 'token_expired', 'message', '투표 코드가 만료되었습니다.');
    end if;

    return cast_ballot_internal(v_registry.election_id, v_registry.id, null, p_selection, p_receipt_hash);
end;
$$;

-- ---------------------------------------------------------------------
-- 본인 재발송 과금 — 대상 확인 + 생성자 포인트 차감 + 1회 사용 표시를 한 트랜잭션으로
--   반환 error: invalid_request | not_found | already_voted | already_used |
--               election_not_active | insufficient_credits
-- ---------------------------------------------------------------------
create or replace function app_open_vote.charge_self_resend(
    p_election_id uuid,
    p_phone text,
    p_unit_price integer
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    v_registry voter_registry%rowtype;
    v_election elections%rowtype;
    v_balance bigint;
begin
    if p_election_id is null or length(v_phone) < 9 or p_unit_price is null or p_unit_price < 0 then
        return json_build_object('success', false, 'error', 'invalid_request');
    end if;

    select * into v_election from elections where id = p_election_id;
    if not found or v_election.status <> 'active'
       or (v_election.ends_at is not null and v_election.ends_at <= now())
       or v_election.created_by is null then
        return json_build_object('success', false, 'error', 'election_not_active');
    end if;

    select * into v_registry from voter_registry
     where election_id = p_election_id and phone = v_phone
     for update;
    if not found then
        return json_build_object('success', false, 'error', 'not_found');
    end if;
    if v_registry.has_voted then
        return json_build_object('success', false, 'error', 'already_voted');
    end if;
    if v_registry.self_resend_used then
        return json_build_object('success', false, 'error', 'already_used');
    end if;

    insert into credit_accounts (user_id) values (v_election.created_by)
    on conflict (user_id) do nothing;
    select balance into v_balance from credit_accounts where user_id = v_election.created_by for update;
    if v_balance < p_unit_price then
        return json_build_object('success', false, 'error', 'insufficient_credits');
    end if;

    v_balance := v_balance - p_unit_price;
    update credit_accounts set balance = v_balance, updated_at = now() where user_id = v_election.created_by;
    insert into credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    values (v_election.created_by, -p_unit_price, v_balance, 'sms_resend', p_election_id,
            format('유권자 본인 재발송: %s', v_election.name), null);

    update voter_registry set self_resend_used = true where id = v_registry.id;

    return json_build_object('success', true, 'voter_id', v_registry.id);
end;
$$;

-- 재발송 문자가 나가지 않았으면 포인트를 돌려주고 1회 기회도 되돌린다
create or replace function app_open_vote.refund_self_resend(
    p_election_id uuid,
    p_voter_id uuid,
    p_unit_price integer
)
returns json
language plpgsql
set search_path = app_open_vote, extensions
as $$
declare
    v_creator uuid;
    v_name text;
    v_balance bigint;
begin
    update voter_registry set self_resend_used = false
     where id = p_voter_id and election_id = p_election_id and self_resend_used = true;
    if not found then
        return json_build_object('success', false, 'error', 'not_found');
    end if;

    select created_by, name into v_creator, v_name from elections where id = p_election_id;
    if v_creator is null or p_unit_price is null or p_unit_price <= 0 then
        return json_build_object('success', true, 'refunded', 0);
    end if;

    select balance into v_balance from credit_accounts where user_id = v_creator for update;
    v_balance := coalesce(v_balance, 0) + p_unit_price;
    update credit_accounts set balance = v_balance, updated_at = now() where user_id = v_creator;
    insert into credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    values (v_creator, p_unit_price, v_balance, 'refund', p_election_id,
            format('유권자 본인 재발송 실패 환불: %s', v_name), null);

    return json_build_object('success', true, 'refunded', p_unit_price);
end;
$$;

-- ---------------------------------------------------------------------
-- 권한 — 전부 service_role 전용
-- ---------------------------------------------------------------------
revoke execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) from public, anon, authenticated;
revoke execute on function app_open_vote.restore_voter_tokens(uuid, jsonb) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_code_ballot(text, jsonb, text) from public, anon, authenticated;
revoke execute on function app_open_vote.charge_self_resend(uuid, text, integer) from public, anon, authenticated;
revoke execute on function app_open_vote.refund_self_resend(uuid, uuid, integer) from public, anon, authenticated;

grant execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) to service_role;
grant execute on function app_open_vote.restore_voter_tokens(uuid, jsonb) to service_role;
grant execute on function app_open_vote.cast_code_ballot(text, jsonb, text) to service_role;
grant execute on function app_open_vote.charge_self_resend(uuid, text, integer) to service_role;
grant execute on function app_open_vote.refund_self_resend(uuid, uuid, integer) to service_role;

select app_open_vote.assert_permission_baseline();
