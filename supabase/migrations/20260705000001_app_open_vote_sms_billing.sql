-- =====================================================
-- Open Vote: SMS 투표 링크 + 포인트 과금 모델 (app_open_vote 스키마 전용)
--
-- 현행 라이브 DB(app_open_vote 스키마)에 안전하게 실행 가능한 멱등 스크립트입니다.
-- (레거시 public 스키마 마이그레이션과 달리 스키마를 명시적으로 지정합니다)
--
-- 추가 내용
--  1) voter_registry: 전화번호/이름/접속토큰해시 컬럼 + email nullable (전화 또는 이메일 필수)
--  2) credit_accounts / credit_transactions: 투표 생성 과금용 포인트 계정·원장
--  3) api_clients: 외부 앱 연동용 API 키(해시 저장)
--  4) RPC:
--     - adjust_credits            포인트 충전/차감 (원자적, 잔액 음수 금지)
--     - create_billed_election    선거+유권자 생성과 포인트 차감을 한 트랜잭션으로
--     - cast_link_vote            SMS 링크 토큰 기반 투표 (영수증/해시체인 유지)
--     - find_user_id_by_email     이메일로 auth.users id 조회 (service_role 전용)
--
-- 보안 메모
--  * 새 테이블은 RLS enable + 정책 없음 => anon/authenticated 접근 불가,
--    서버 라우트(service_role)만 접근합니다(audit_logs와 동일 패턴).
--  * 과금/토큰 RPC는 SECURITY INVOKER라 authenticated가 직접 호출해도
--    RLS(정책 없음)에 막혀 실패합니다. 추가로 EXECUTE 권한도 회수합니다.
--  * 링크 토큰은 원문을 저장하지 않고 SHA-256 해시만 저장합니다.
-- =====================================================

-- ---------------------------------------------------------------------------
-- 1) voter_registry: 전화번호 기반 유권자 + 접속 토큰
-- ---------------------------------------------------------------------------
alter table app_open_vote.voter_registry add column if not exists phone text;
alter table app_open_vote.voter_registry add column if not exists voter_name text;
alter table app_open_vote.voter_registry add column if not exists access_token_hash text;

alter table app_open_vote.voter_registry alter column email drop not null;

-- email 필수 제약을 "email 또는 phone 중 하나 필수"로 교체
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'voter_registry_email_not_blank'
      and conrelid = 'app_open_vote.voter_registry'::regclass
  ) then
    alter table app_open_vote.voter_registry drop constraint voter_registry_email_not_blank;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'voter_registry_contact_present'
      and conrelid = 'app_open_vote.voter_registry'::regclass
  ) then
    alter table app_open_vote.voter_registry add constraint voter_registry_contact_present check (
      (email is not null and length(trim(email)) > 0)
      or (phone is not null and length(trim(phone)) > 0)
    );
  end if;
end $$;

create unique index if not exists idx_voter_registry_election_phone
  on app_open_vote.voter_registry(election_id, phone) where phone is not null;
create unique index if not exists idx_voter_registry_token
  on app_open_vote.voter_registry(access_token_hash) where access_token_hash is not null;

comment on column app_open_vote.voter_registry.phone is 'SMS 발송 대상 전화번호(숫자만, 예: 01012345678). 선거 내 유일';
comment on column app_open_vote.voter_registry.voter_name is 'SMS 개인화 변수용 이름(선택)';
comment on column app_open_vote.voter_registry.access_token_hash is '투표 링크 토큰의 SHA-256 hex. 원문 토큰은 저장하지 않으며 재발송 시 회전됨';

-- ---------------------------------------------------------------------------
-- 2) 포인트 계정 / 원장
-- ---------------------------------------------------------------------------
create table if not exists app_open_vote.credit_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table app_open_vote.credit_accounts is '투표 생성자별 선불 포인트 잔액(1포인트=1원 기준)';

create table if not exists app_open_vote.credit_transactions (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        bigint not null,
  balance_after bigint not null,
  tx_type       text not null check (tx_type in ('charge', 'vote_creation', 'refund', 'admin_adjust')),
  election_id   uuid references app_open_vote.elections(id) on delete set null,
  memo          text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

comment on table app_open_vote.credit_transactions is '포인트 충전(+)/차감(-) 원장. vote_creation은 유권자 1인당 단가 × 인원';

create index if not exists idx_credit_transactions_user
  on app_open_vote.credit_transactions(user_id, created_at desc);
create index if not exists idx_credit_transactions_election
  on app_open_vote.credit_transactions(election_id) where election_id is not null;

-- ---------------------------------------------------------------------------
-- 3) 외부 앱 연동용 API 클라이언트
-- ---------------------------------------------------------------------------
create table if not exists app_open_vote.api_clients (
  id            uuid primary key default extensions.uuid_generate_v4(),
  name          text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  key_hash      text not null unique,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

comment on table app_open_vote.api_clients is '외부 앱 연동용 API 키(SHA-256 해시만 저장). 과금은 owner_user_id 포인트 계정으로';

create index if not exists idx_api_clients_owner on app_open_vote.api_clients(owner_user_id);

-- RLS: 정책 없이 enable => service_role 전용 (audit_logs 패턴)
alter table app_open_vote.credit_accounts     enable row level security;
alter table app_open_vote.credit_transactions enable row level security;
alter table app_open_vote.api_clients         enable row level security;

-- credit_accounts.updated_at 자동 갱신
drop trigger if exists update_credit_accounts_updated_at on app_open_vote.credit_accounts;
create trigger update_credit_accounts_updated_at before update on app_open_vote.credit_accounts
  for each row execute function app_open_vote.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) RPC: 포인트 충전/차감
-- ---------------------------------------------------------------------------
create or replace function app_open_vote.adjust_credits(
  p_user_id uuid,
  p_amount bigint,
  p_tx_type text,
  p_memo text default null,
  p_actor uuid default null
)
returns json language plpgsql set search_path = app_open_vote, extensions as $$
DECLARE
    v_balance BIGINT;
BEGIN
    IF p_user_id IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request',
                                 'message', '사용자 또는 금액이 올바르지 않습니다.');
    END IF;
    IF p_tx_type NOT IN ('charge', 'refund', 'admin_adjust') THEN
        RETURN json_build_object('success', false, 'error', 'invalid_tx_type',
                                 'message', '허용되지 않는 거래 유형입니다.');
    END IF;

    INSERT INTO credit_accounts (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_balance FROM credit_accounts WHERE user_id = p_user_id FOR UPDATE;

    IF v_balance + p_amount < 0 THEN
        RETURN json_build_object('success', false, 'error', 'insufficient_credits',
                                 'message', '포인트 잔액이 부족합니다.', 'balance', v_balance);
    END IF;

    v_balance := v_balance + p_amount;

    UPDATE credit_accounts SET balance = v_balance, updated_at = NOW() WHERE user_id = p_user_id;

    INSERT INTO credit_transactions (user_id, amount, balance_after, tx_type, memo, created_by)
    VALUES (p_user_id, p_amount, v_balance, p_tx_type, p_memo, p_actor);

    RETURN json_build_object('success', true, 'balance', v_balance);
END;
$$;

comment on function app_open_vote.adjust_credits(uuid, bigint, text, text, uuid)
is '포인트 충전/환불/관리자조정을 원자적으로 처리(잔액 음수 금지). service_role 전용';

-- ---------------------------------------------------------------------------
-- 5) RPC: 선거 생성 + 유권자 등록 + 포인트 차감 (단일 트랜잭션)
-- ---------------------------------------------------------------------------
create or replace function app_open_vote.create_billed_election(
  p_creator uuid,
  p_name text,
  p_description text,
  p_candidates jsonb,
  p_voters jsonb,
  p_unit_price integer,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default now() + interval '7 days'
)
returns json language plpgsql set search_path = app_open_vote, extensions as $$
DECLARE
    v_count INTEGER;
    v_cost BIGINT;
    v_balance BIGINT;
    v_election_id UUID;
    v_voter JSONB;
    v_email TEXT;
    v_phone TEXT;
BEGIN
    IF p_creator IS NULL OR p_name IS NULL OR trim(p_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request',
                                 'message', '생성자 또는 투표명이 올바르지 않습니다.');
    END IF;

    IF p_candidates IS NULL OR jsonb_typeof(p_candidates) != 'array' OR jsonb_array_length(p_candidates) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_candidates',
                                 'message', '투표 항목이 필요합니다.');
    END IF;

    IF p_voters IS NULL OR jsonb_typeof(p_voters) != 'array' OR jsonb_array_length(p_voters) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_voters',
                                 'message', '유권자 명부가 필요합니다.');
    END IF;

    IF p_unit_price IS NULL OR p_unit_price < 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_unit_price',
                                 'message', '유권자 단가가 올바르지 않습니다.');
    END IF;

    v_count := jsonb_array_length(p_voters);
    v_cost := v_count::BIGINT * p_unit_price;

    INSERT INTO credit_accounts (user_id) VALUES (p_creator)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance INTO v_balance FROM credit_accounts WHERE user_id = p_creator FOR UPDATE;

    IF v_balance < v_cost THEN
        RETURN json_build_object('success', false, 'error', 'insufficient_credits',
                                 'message', '포인트 잔액이 부족합니다.',
                                 'balance', v_balance, 'required', v_cost);
    END IF;

    INSERT INTO elections (name, description, candidates, total_voter_codes, created_by, starts_at, ends_at)
    VALUES (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_candidates, v_count, p_creator, p_starts_at, p_ends_at)
    RETURNING id INTO v_election_id;

    FOR v_voter IN SELECT * FROM jsonb_array_elements(p_voters) LOOP
        v_email := nullif(lower(trim(coalesce(v_voter ->> 'email', ''))), '');
        v_phone := nullif(regexp_replace(coalesce(v_voter ->> 'phone', ''), '[^0-9]', '', 'g'), '');

        IF v_email IS NULL AND v_phone IS NULL THEN
            RAISE EXCEPTION 'voter_contact_missing' USING ERRCODE = 'check_violation';
        END IF;

        INSERT INTO voter_registry (election_id, email, phone, voter_name)
        VALUES (v_election_id, v_email, v_phone, nullif(trim(coalesce(v_voter ->> 'name', '')), ''));
    END LOOP;

    v_balance := v_balance - v_cost;

    UPDATE credit_accounts SET balance = v_balance, updated_at = NOW() WHERE user_id = p_creator;

    INSERT INTO credit_transactions (user_id, amount, balance_after, tx_type, election_id, memo, created_by)
    VALUES (p_creator, -v_cost, v_balance, 'vote_creation', v_election_id,
            format('투표 생성: %s (유권자 %s명 × %s)', trim(p_name), v_count, p_unit_price), p_creator);

    RETURN json_build_object('success', true, 'election_id', v_election_id,
                             'voter_count', v_count, 'cost', v_cost, 'balance', v_balance);
EXCEPTION
    WHEN unique_violation THEN
        RETURN json_build_object('success', false, 'error', 'duplicate_voter',
                                 'message', '유권자 명부에 중복된 이메일 또는 전화번호가 있습니다.');
    WHEN check_violation THEN
        RETURN json_build_object('success', false, 'error', 'invalid_voter',
                                 'message', '이메일 또는 전화번호가 없는 유권자가 있습니다.');
END;
$$;

comment on function app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz)
is '선거+유권자 생성과 유권자 1인당 단가 포인트 차감을 단일 트랜잭션으로 처리. service_role 전용';

-- ---------------------------------------------------------------------------
-- 6) RPC: SMS 링크 토큰 기반 투표 (영수증 + 해시체인 = 5-arg cast_registered_vote와 동일)
-- ---------------------------------------------------------------------------
create or replace function app_open_vote.cast_link_vote(
  p_election_id uuid,
  p_token_hash text,
  p_selected_candidate text,
  p_receipt_hash text
)
returns json language plpgsql set search_path = app_open_vote, extensions as $$
DECLARE
    v_election elections%ROWTYPE;
    v_registry voter_registry%ROWTYPE;
    v_candidate_exists BOOLEAN;
    v_previous_chain_hash TEXT;
    v_sequence_number BIGINT;
    v_chain_hash TEXT;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
       OR p_selected_candidate IS NULL OR trim(p_selected_candidate) = ''
       OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[a-f0-9]{64}$' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request',
                                 'message', '투표 링크, 투표 항목 또는 영수증 해시가 올바르지 않습니다.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_election_id::TEXT, 0));

    SELECT * INTO v_election FROM elections WHERE id = p_election_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    END IF;
    IF v_election.status != 'active' THEN
        RETURN json_build_object('success', false, 'error', 'election_not_active', 'message', '이 선거는 현재 진행 중이 아닙니다.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_election.candidates) AS candidate
        WHERE candidate ->> 'id' = p_selected_candidate
    ) INTO v_candidate_exists;
    IF NOT v_candidate_exists THEN
        RETURN json_build_object('success', false, 'error', 'invalid_candidate', 'message', '선택할 수 없는 항목입니다.');
    END IF;

    IF EXISTS (SELECT 1 FROM ballots WHERE election_id = p_election_id AND receipt_hash = p_receipt_hash) THEN
        RETURN json_build_object('success', false, 'error', 'duplicate_receipt', 'message', '이미 사용된 영수증 해시입니다.');
    END IF;

    SELECT * INTO v_registry FROM voter_registry
    WHERE election_id = p_election_id AND access_token_hash = p_token_hash
    LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'invalid_token', 'message', '유효하지 않은 투표 링크입니다.');
    END IF;
    IF v_registry.has_voted THEN
        RETURN json_build_object('success', false, 'error', 'already_voted', 'message', '이미 투표를 완료했습니다.');
    END IF;

    SELECT sequence_number, chain_hash INTO v_sequence_number, v_previous_chain_hash
    FROM ballots
    WHERE election_id = p_election_id AND sequence_number IS NOT NULL AND chain_hash IS NOT NULL
    ORDER BY sequence_number DESC LIMIT 1;

    v_sequence_number := COALESCE(v_sequence_number, 0) + 1;
    v_chain_hash := encode(
        digest(
            concat_ws('|', p_election_id::TEXT, v_sequence_number::TEXT, p_selected_candidate, p_receipt_hash,
                      COALESCE(v_previous_chain_hash, 'GENESIS')),
            'sha256'),
        'hex');

    UPDATE voter_registry
       SET has_voted = TRUE, voted_at = NOW(), updated_at = NOW()
     WHERE id = v_registry.id;

    INSERT INTO ballots (election_id, selected_candidate, sequence_number, receipt_hash, previous_chain_hash, chain_hash)
    VALUES (p_election_id, p_selected_candidate, v_sequence_number, p_receipt_hash, v_previous_chain_hash, v_chain_hash);

    RETURN json_build_object('success', true, 'message', '투표가 완료되었습니다.',
                             'receipt_hash', p_receipt_hash, 'sequence_number', v_sequence_number, 'chain_hash', v_chain_hash);
END;
$$;

comment on function app_open_vote.cast_link_vote(uuid, text, text, text)
is 'SMS 투표 링크 토큰(해시)으로 유권자를 식별해 영수증·해시체인 투표를 원자적으로 처리. service_role 전용';

-- ---------------------------------------------------------------------------
-- 7) RPC: 투표 링크 토큰 일괄 회전 (SMS 발송 직전에 호출)
--    p_tokens: [{"id": "<voter_registry.id>", "hash": "<sha256 hex>"}, ...]
--    이미 투표한 유권자와 다른 선거의 행은 건너뜁니다.
-- ---------------------------------------------------------------------------
create or replace function app_open_vote.rotate_voter_tokens(
  p_election_id uuid,
  p_tokens jsonb
)
returns integer language plpgsql set search_path = app_open_vote, extensions as $$
DECLARE
    v_updated INTEGER := 0;
BEGIN
    IF p_election_id IS NULL OR p_tokens IS NULL OR jsonb_typeof(p_tokens) != 'array' THEN
        RETURN 0;
    END IF;

    UPDATE voter_registry vr
       SET access_token_hash = t.hash, updated_at = NOW()
      FROM (
        SELECT (item ->> 'id')::uuid AS id, item ->> 'hash' AS hash
        FROM jsonb_array_elements(p_tokens) AS item
      ) t
     WHERE vr.id = t.id
       AND vr.election_id = p_election_id
       AND vr.has_voted = FALSE
       AND t.hash ~ '^[a-f0-9]{64}$';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;

comment on function app_open_vote.rotate_voter_tokens(uuid, jsonb)
is 'SMS 발송 직전 유권자별 링크 토큰 해시를 일괄 교체. 재발송 시 이전 링크는 무효화됨. service_role 전용';

-- ---------------------------------------------------------------------------
-- 8) RPC: 이메일로 auth 사용자 조회 (관리자 포인트 지급/API 키 발급용)
-- ---------------------------------------------------------------------------
create or replace function app_open_vote.find_user_id_by_email(p_email text)
returns uuid language sql security definer set search_path = app_open_vote, extensions as $$
    SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;

comment on function app_open_vote.find_user_id_by_email(text)
is '이메일로 auth.users id 조회. SECURITY DEFINER이므로 service_role 외 실행 권한을 회수함';

-- ---------------------------------------------------------------------------
-- 9) 실행 권한: 과금/토큰/사용자조회 RPC는 service_role 전용으로 제한
--    (스키마 기본 권한이 anon/authenticated에도 EXECUTE를 주므로 명시적으로 회수)
-- ---------------------------------------------------------------------------
revoke execute on function app_open_vote.adjust_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;
revoke execute on function app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function app_open_vote.cast_link_vote(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) from public, anon, authenticated;
revoke execute on function app_open_vote.find_user_id_by_email(text) from public, anon, authenticated;

grant execute on function app_open_vote.adjust_credits(uuid, bigint, text, text, uuid) to service_role;
grant execute on function app_open_vote.create_billed_election(uuid, text, text, jsonb, jsonb, integer, timestamptz, timestamptz) to service_role;
grant execute on function app_open_vote.cast_link_vote(uuid, text, text, text) to service_role;
grant execute on function app_open_vote.rotate_voter_tokens(uuid, jsonb) to service_role;
grant execute on function app_open_vote.find_user_id_by_email(text) to service_role;
