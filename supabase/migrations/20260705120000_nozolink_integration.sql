-- =====================================================
-- Open Vote ↔ nozolink 연동
-- 두 가지 신규 인증 방식(auth_mode)을 기존 email_link 방식과 함께 지원한다.
--   * member_session : nozolink 세션 핸드오프로 로그인한 조합원이 auth.uid로 기표 (무료)
--   * sms_token      : 유권자 전화번호 명부 기반 1회용 링크(/v/<token>), 유권자당 선불 포인트 차감
-- 기존 email_link(매직링크) 흐름은 그대로 유지된다.
-- 익명성 모델(명부 사용 처리와 ballots 저장의 비연결, 해시체인)은 cast_registered_vote와 동일하다.
-- 모든 구문은 재실행 가능(idempotent)하도록 작성한다.
-- =====================================================

-- 라이브(병합) 프로젝트의 openvote 테이블은 app_open_vote 스키마에 있다. SQL Editor/db push의
-- 기본 search_path 는 public 이므로, 비한정 참조(elections 등)와 확장 함수
-- (uuid_generate_v4/digest/gen_random_bytes 는 extensions 스키마)를 위해 스키마를 명시한다.
SET search_path = app_open_vote, public, extensions;

-- 필수 확장(이미 존재하면 무시)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------
-- 1. elections: 인증 방식 + 연동 조합
-- -----------------------------------------------------
ALTER TABLE elections
    ADD COLUMN IF NOT EXISTS auth_mode TEXT NOT NULL DEFAULT 'email_link',
    ADD COLUMN IF NOT EXISTS nozolink_union_id UUID,
    ADD COLUMN IF NOT EXISTS credit_per_voter INTEGER,
    ADD COLUMN IF NOT EXISTS billed_owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS billed_points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE elections DROP CONSTRAINT IF EXISTS elections_auth_mode_check;
ALTER TABLE elections
    ADD CONSTRAINT elections_auth_mode_check
    CHECK (auth_mode IN ('email_link', 'member_session', 'sms_token'));

COMMENT ON COLUMN elections.auth_mode IS 'email_link: 기존 매직링크, member_session: nozolink 세션 기표(무료), sms_token: 문자 1회용 링크(유료)';
COMMENT ON COLUMN elections.nozolink_union_id IS '연동된 nozolink 조합 id(논리 참조, 스키마 경계상 FK 없음)';
COMMENT ON COLUMN elections.billed_points IS 'sms_token 생성 시 실제 차감된 포인트 총액';

CREATE INDEX IF NOT EXISTS idx_elections_nozolink_union
    ON elections(nozolink_union_id) WHERE nozolink_union_id IS NOT NULL;

-- -----------------------------------------------------
-- 2. voter_registry: member_session / sms_token 명부 컬럼
--    email은 신규 방식에서 없을 수 있으므로 NOT NULL을 완화한다.
-- -----------------------------------------------------
ALTER TABLE voter_registry
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS display_name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS phone_suffix TEXT,
    ADD COLUMN IF NOT EXISTS token_hash TEXT,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS token_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS external_member_id UUID;

COMMENT ON COLUMN voter_registry.auth_user_id IS 'member_session 명부: 사전 지정된 조합원 auth 유저(전화번호 해시 대신 auth user 기준)';
COMMENT ON COLUMN voter_registry.token_hash IS 'sms_token 1회용 링크 토큰의 sha256 해시(평문 토큰은 저장하지 않음)';
COMMENT ON COLUMN voter_registry.external_member_id IS 'nozolink user_unions/users 매핑용 참조(논리 참조)';

ALTER TABLE voter_registry ALTER COLUMN email DROP NOT NULL;
ALTER TABLE voter_registry DROP CONSTRAINT IF EXISTS voter_registry_email_not_blank;
ALTER TABLE voter_registry DROP CONSTRAINT IF EXISTS voter_registry_identity_present;
ALTER TABLE voter_registry
    ADD CONSTRAINT voter_registry_identity_present CHECK (
        (email IS NOT NULL AND length(trim(email)) > 0)
        OR auth_user_id IS NOT NULL
        OR token_hash IS NOT NULL
    );

-- 이메일 유니크 인덱스를 부분 인덱스로 재작성(email NULL 허용)
DROP INDEX IF EXISTS idx_voter_registry_election_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_election_email
    ON voter_registry(election_id, lower(email)) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_election_auth_user
    ON voter_registry(election_id, auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_token
    ON voter_registry(token_hash) WHERE token_hash IS NOT NULL;

-- -----------------------------------------------------
-- 3. api_clients: 외부 서버-서버 연동 키 (X-Api-Key → owner_user_id 과금 대상)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS api_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    key_prefix TEXT,
    key_hash TEXT,
    owner_user_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
-- 프로덕션에 이미 api_clients 가 다른 구조로 존재할 수 있으므로 필요한 컬럼을 보강한다.
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS key_hash TEXT;
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
COMMENT ON TABLE api_clients IS '외부 연동용 API 키. key_hash=sha256(전체 키). owner_user_id가 포인트 과금 대상.';
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_clients_key_hash ON api_clients(key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_clients_key_prefix ON api_clients(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_clients_owner ON api_clients(owner_user_id);

ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- 4. 선불 포인트: 지갑 + 원장
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS point_wallets (
    owner_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE point_wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMENT ON TABLE point_wallets IS 'creator(선거 생성자/연동 소유자)별 선불 포인트 잔액';

CREATE TABLE IF NOT EXISTS point_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    election_id UUID REFERENCES elections(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS owner_user_id UUID;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS delta INTEGER;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS election_id UUID;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE point_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMENT ON TABLE point_ledger IS '포인트 충전/차감 원장. reason: charge | election_charge | refund';
CREATE INDEX IF NOT EXISTS idx_point_ledger_owner ON point_ledger(owner_user_id, created_at DESC);

ALTER TABLE point_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_ledger ENABLE ROW LEVEL SECURITY;

-- 서비스 롤은 RLS를 우회하지만 명시적으로 권한을 부여한다.
GRANT SELECT, INSERT, UPDATE, DELETE ON api_clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON point_wallets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON point_ledger TO service_role;

-- -----------------------------------------------------
-- 5. RPC: charge_points (관리자 충전 / 환불 공용)
--    p_amount > 0 충전, < 0 차감. 잔액 음수 방지.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION charge_points(
    p_owner_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_actor UUID DEFAULT NULL,
    p_memo TEXT DEFAULT NULL,
    p_election_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    IF p_owner_user_id IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '충전 대상 또는 금액이 올바르지 않습니다.');
    END IF;

    INSERT INTO point_wallets (owner_user_id, balance)
    VALUES (p_owner_user_id, 0)
    ON CONFLICT (owner_user_id) DO NOTHING;

    SELECT balance INTO v_balance
    FROM point_wallets
    WHERE owner_user_id = p_owner_user_id
    FOR UPDATE;

    IF v_balance + p_amount < 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'insufficient_points',
            'message', '포인트 잔액이 부족합니다.',
            'balance', v_balance,
            'required', -p_amount
        );
    END IF;

    v_balance := v_balance + p_amount;

    UPDATE point_wallets
    SET balance = v_balance, updated_at = NOW()
    WHERE owner_user_id = p_owner_user_id;

    INSERT INTO point_ledger (owner_user_id, delta, balance_after, reason, election_id, created_by, memo)
    VALUES (p_owner_user_id, p_amount, v_balance, COALESCE(p_reason, 'charge'), p_election_id, p_actor, p_memo);

    RETURN json_build_object('success', true, 'balance', v_balance, 'delta', p_amount);
END;
$$;

COMMENT ON FUNCTION charge_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID) IS '선불 포인트 충전/차감 원장 처리(원자적).';

-- -----------------------------------------------------
-- 6. RPC: create_election_with_billing
--    선거 + 명부를 생성하고, sms_token이면 포인트를 차감한다.
--    p_voters 예:
--      member_session: [{"auth_user_id":"...","name":"홍길동","external_member_id":"..."}]
--      sms_token:      [{"phone":"+8210...","name":"홍길동","external_member_id":"..."}]
--    반환(sms_token): sms_targets[{registry_id, phone, token, name}] — 라우트가 문자 발송에 사용.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION create_election_with_billing(
    p_name TEXT,
    p_description TEXT,
    p_candidates JSONB,
    p_auth_mode TEXT,
    p_nozolink_union_id UUID,
    p_owner_user_id UUID,
    p_created_by UUID,
    p_voters JSONB,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_credit_per_voter INTEGER DEFAULT 10,
    p_token_ttl_hours INTEGER DEFAULT 168
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election_id UUID;
    v_voter_count INTEGER;
    v_cost INTEGER := 0;
    v_balance INTEGER := 0;
    v_charge JSON;
    v_voter JSONB;
    v_token TEXT;
    v_token_hash TEXT;
    v_registry_id UUID;
    v_sms_targets JSONB := '[]'::JSONB;
    v_phone TEXT;
    v_suffix TEXT;
BEGIN
    IF p_auth_mode NOT IN ('member_session', 'sms_token') THEN
        RETURN json_build_object('success', false, 'error', 'invalid_auth_mode', 'message', '지원하지 않는 인증 방식입니다.');
    END IF;

    IF p_name IS NULL OR trim(p_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '투표명을 입력해주세요.');
    END IF;

    IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' OR jsonb_array_length(p_candidates) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '최소 한 개 이상의 투표 항목이 필요합니다.');
    END IF;

    IF p_voters IS NULL OR jsonb_typeof(p_voters) <> 'array' OR jsonb_array_length(p_voters) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '유권자 명부가 비어 있습니다.');
    END IF;

    v_voter_count := jsonb_array_length(p_voters);
    IF v_voter_count > 10000 THEN
        RETURN json_build_object('success', false, 'error', 'too_many_voters', 'message', '유권자는 한 번에 최대 10,000명까지 등록할 수 있습니다.');
    END IF;

    -- 과금(중요 안건만): 명부 규모 × 유권자당 포인트 선불 차감
    IF p_auth_mode = 'sms_token' THEN
        v_cost := v_voter_count * GREATEST(p_credit_per_voter, 0);

        INSERT INTO point_wallets (owner_user_id, balance)
        VALUES (p_owner_user_id, 0)
        ON CONFLICT (owner_user_id) DO NOTHING;

        SELECT balance INTO v_balance
        FROM point_wallets
        WHERE owner_user_id = p_owner_user_id
        FOR UPDATE;

        IF v_balance < v_cost THEN
            RETURN json_build_object(
                'success', false,
                'error', 'insufficient_points',
                'message', '포인트 잔액이 부족합니다. 충전 후 다시 시도해주세요.',
                'required', v_cost,
                'balance', v_balance
            );
        END IF;
    END IF;

    -- 선거 생성
    INSERT INTO elections (
        name, description, candidates, total_voter_codes, status,
        auth_mode, nozolink_union_id, credit_per_voter, billed_owner_user_id, billed_points,
        created_by, starts_at, ends_at
    )
    VALUES (
        trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_candidates, v_voter_count, 'draft',
        p_auth_mode, p_nozolink_union_id,
        CASE WHEN p_auth_mode = 'sms_token' THEN p_credit_per_voter ELSE 0 END,
        CASE WHEN p_auth_mode = 'sms_token' THEN p_owner_user_id ELSE NULL END,
        v_cost,
        p_created_by, p_starts_at, p_ends_at
    )
    RETURNING id INTO v_election_id;

    -- 명부 삽입
    FOR v_voter IN SELECT * FROM jsonb_array_elements(p_voters)
    LOOP
        IF p_auth_mode = 'member_session' THEN
            IF (v_voter ->> 'auth_user_id') IS NULL THEN
                CONTINUE;
            END IF;
            INSERT INTO voter_registry (election_id, auth_user_id, display_name, external_member_id, invited_at)
            VALUES (
                v_election_id,
                (v_voter ->> 'auth_user_id')::UUID,
                NULLIF(trim(COALESCE(v_voter ->> 'name', '')), ''),
                CASE WHEN (v_voter ->> 'external_member_id') ~ '^[0-9a-fA-F-]{36}$' THEN (v_voter ->> 'external_member_id')::UUID ELSE NULL END,
                NOW()
            )
            ON CONFLICT (election_id, auth_user_id) WHERE auth_user_id IS NOT NULL DO NOTHING;
        ELSE
            -- sms_token
            v_phone := NULLIF(trim(COALESCE(v_voter ->> 'phone', '')), '');
            IF v_phone IS NULL THEN
                CONTINUE;
            END IF;
            v_suffix := right(regexp_replace(v_phone, '\D', '', 'g'), 4);
            v_token := encode(gen_random_bytes(18), 'hex');
            v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

            INSERT INTO voter_registry (
                election_id, phone, phone_suffix, display_name, external_member_id,
                token_hash, token_expires_at, invited_at
            )
            VALUES (
                v_election_id, v_phone, v_suffix,
                NULLIF(trim(COALESCE(v_voter ->> 'name', '')), ''),
                CASE WHEN (v_voter ->> 'external_member_id') ~ '^[0-9a-fA-F-]{36}$' THEN (v_voter ->> 'external_member_id')::UUID ELSE NULL END,
                v_token_hash, NOW() + make_interval(hours => p_token_ttl_hours), NOW()
            )
            RETURNING id INTO v_registry_id;

            v_sms_targets := v_sms_targets || jsonb_build_object(
                'registry_id', v_registry_id,
                'phone', v_phone,
                'token', v_token,
                'name', COALESCE(v_voter ->> 'name', '')
            );
        END IF;
    END LOOP;

    -- 실제 등록된 인원으로 total 및 과금 정정
    SELECT COUNT(*) INTO v_voter_count FROM voter_registry WHERE election_id = v_election_id;

    IF p_auth_mode = 'sms_token' THEN
        v_cost := v_voter_count * GREATEST(p_credit_per_voter, 0);
        v_charge := charge_points(p_owner_user_id, -v_cost, 'election_charge', p_created_by, p_name, v_election_id);
        IF (v_charge ->> 'success')::BOOLEAN IS NOT TRUE THEN
            -- 이론상 위에서 잔액 확인했으므로 도달하기 어렵지만 안전하게 롤백
            DELETE FROM elections WHERE id = v_election_id;
            RETURN v_charge;
        END IF;
        UPDATE elections SET total_voter_codes = v_voter_count, billed_points = v_cost WHERE id = v_election_id;
    ELSE
        UPDATE elections SET total_voter_codes = v_voter_count WHERE id = v_election_id;
    END IF;

    INSERT INTO audit_logs (event_type, election_id, details)
    VALUES ('external_election_created', v_election_id, jsonb_build_object(
        'auth_mode', p_auth_mode,
        'union_id', p_nozolink_union_id,
        'voter_count', v_voter_count,
        'charged', v_cost,
        'actor', p_created_by
    ));

    RETURN json_build_object(
        'success', true,
        'election_id', v_election_id,
        'auth_mode', p_auth_mode,
        'voter_count', v_voter_count,
        'charged', CASE WHEN p_auth_mode = 'sms_token' THEN v_cost ELSE 0 END,
        'sms_targets', CASE WHEN p_auth_mode = 'sms_token' THEN v_sms_targets ELSE '[]'::JSONB END
    );
END;
$$;

COMMENT ON FUNCTION create_election_with_billing(TEXT, TEXT, JSONB, TEXT, UUID, UUID, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER)
IS '연동 선거 생성 + 명부 등록 + sms_token 선불 차감을 원자적으로 처리.';

-- -----------------------------------------------------
-- 7. RPC: cast_member_vote (member_session)
--    auth.uid 기반. cast_registered_vote와 동일한 익명성/해시체인 모델.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION cast_member_vote(
    p_election_id UUID,
    p_user_id UUID,
    p_selected_candidate TEXT,
    p_receipt_hash TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_registry voter_registry%ROWTYPE;
    v_candidate_exists BOOLEAN;
    v_previous_chain_hash TEXT;
    v_sequence_number BIGINT;
    v_chain_hash TEXT;
BEGIN
    IF p_user_id IS NULL
       OR p_selected_candidate IS NULL
       OR trim(p_selected_candidate) = ''
       OR p_receipt_hash IS NULL
       OR p_receipt_hash !~ '^[a-f0-9]{64}$' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '로그인 정보, 투표 항목 또는 영수증 해시가 올바르지 않습니다.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_election_id::TEXT, 0));

    SELECT * INTO v_election FROM elections WHERE id = p_election_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    END IF;

    IF v_election.auth_mode <> 'member_session' THEN
        RETURN json_build_object('success', false, 'error', 'auth_mode_mismatch', 'message', '이 선거는 세션 투표 방식이 아닙니다.');
    END IF;

    IF v_election.status <> 'active' THEN
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

    SELECT * INTO v_registry
    FROM voter_registry
    WHERE election_id = p_election_id AND auth_user_id = p_user_id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'not_registered', 'message', '이 선거에 등록된 조합원이 아닙니다.');
    END IF;

    IF v_registry.has_voted THEN
        RETURN json_build_object('success', false, 'error', 'already_voted', 'message', '이미 투표를 완료했습니다.');
    END IF;

    SELECT sequence_number, chain_hash INTO v_sequence_number, v_previous_chain_hash
    FROM ballots
    WHERE election_id = p_election_id AND sequence_number IS NOT NULL AND chain_hash IS NOT NULL
    ORDER BY sequence_number DESC
    LIMIT 1;

    v_sequence_number := COALESCE(v_sequence_number, 0) + 1;
    v_chain_hash := encode(digest(concat_ws('|',
        p_election_id::TEXT, v_sequence_number::TEXT, p_selected_candidate, p_receipt_hash,
        COALESCE(v_previous_chain_hash, 'GENESIS')), 'sha256'), 'hex');

    UPDATE voter_registry
    SET has_voted = TRUE, voted_at = NOW(), updated_at = NOW(), user_id = COALESCE(user_id, p_user_id)
    WHERE id = v_registry.id;

    INSERT INTO ballots (election_id, selected_candidate, sequence_number, receipt_hash, previous_chain_hash, chain_hash)
    VALUES (p_election_id, p_selected_candidate, v_sequence_number, p_receipt_hash, v_previous_chain_hash, v_chain_hash);

    RETURN json_build_object('success', true, 'message', '투표가 완료되었습니다.',
        'receipt_hash', p_receipt_hash, 'sequence_number', v_sequence_number, 'chain_hash', v_chain_hash);
END;
$$;

COMMENT ON FUNCTION cast_member_vote(UUID, UUID, TEXT, TEXT) IS 'member_session: 조합원 세션(auth.uid) 기반 익명 기표(해시체인).';

-- -----------------------------------------------------
-- 8. RPC: cast_link_vote (sms_token)
--    문자 1회용 토큰 기반. 토큰으로 명부 행을 찾아 기표.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION cast_link_vote(
    p_token TEXT,
    p_selected_candidate TEXT,
    p_receipt_hash TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_registry voter_registry%ROWTYPE;
    v_token_hash TEXT;
    v_candidate_exists BOOLEAN;
    v_previous_chain_hash TEXT;
    v_sequence_number BIGINT;
    v_chain_hash TEXT;
BEGIN
    IF p_token IS NULL OR trim(p_token) = ''
       OR p_selected_candidate IS NULL OR trim(p_selected_candidate) = ''
       OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[a-f0-9]{64}$' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '토큰, 투표 항목 또는 영수증 해시가 올바르지 않습니다.');
    END IF;

    v_token_hash := encode(digest(trim(p_token), 'sha256'), 'hex');

    SELECT * INTO v_registry FROM voter_registry WHERE token_hash = v_token_hash LIMIT 1;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'invalid_token', 'message', '유효하지 않은 투표 링크입니다.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_registry.election_id::TEXT, 0));

    SELECT * INTO v_registry FROM voter_registry WHERE id = v_registry.id FOR UPDATE;

    IF v_registry.token_expires_at IS NOT NULL AND v_registry.token_expires_at < NOW() THEN
        RETURN json_build_object('success', false, 'error', 'token_expired', 'message', '투표 링크가 만료되었습니다.');
    END IF;

    IF v_registry.has_voted THEN
        RETURN json_build_object('success', false, 'error', 'already_voted', 'message', '이미 투표를 완료했습니다.');
    END IF;

    SELECT * INTO v_election FROM elections WHERE id = v_registry.election_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    END IF;

    IF v_election.status <> 'active' THEN
        RETURN json_build_object('success', false, 'error', 'election_not_active', 'message', '이 선거는 현재 진행 중이 아닙니다.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_election.candidates) AS candidate
        WHERE candidate ->> 'id' = p_selected_candidate
    ) INTO v_candidate_exists;

    IF NOT v_candidate_exists THEN
        RETURN json_build_object('success', false, 'error', 'invalid_candidate', 'message', '선택할 수 없는 항목입니다.');
    END IF;

    IF EXISTS (SELECT 1 FROM ballots WHERE election_id = v_election.id AND receipt_hash = p_receipt_hash) THEN
        RETURN json_build_object('success', false, 'error', 'duplicate_receipt', 'message', '이미 사용된 영수증 해시입니다.');
    END IF;

    SELECT sequence_number, chain_hash INTO v_sequence_number, v_previous_chain_hash
    FROM ballots
    WHERE election_id = v_election.id AND sequence_number IS NOT NULL AND chain_hash IS NOT NULL
    ORDER BY sequence_number DESC
    LIMIT 1;

    v_sequence_number := COALESCE(v_sequence_number, 0) + 1;
    v_chain_hash := encode(digest(concat_ws('|',
        v_election.id::TEXT, v_sequence_number::TEXT, p_selected_candidate, p_receipt_hash,
        COALESCE(v_previous_chain_hash, 'GENESIS')), 'sha256'), 'hex');

    UPDATE voter_registry
    SET has_voted = TRUE, voted_at = NOW(), updated_at = NOW()
    WHERE id = v_registry.id;

    INSERT INTO ballots (election_id, selected_candidate, sequence_number, receipt_hash, previous_chain_hash, chain_hash)
    VALUES (v_election.id, p_selected_candidate, v_sequence_number, p_receipt_hash, v_previous_chain_hash, v_chain_hash);

    RETURN json_build_object('success', true, 'message', '투표가 완료되었습니다.',
        'receipt_hash', p_receipt_hash, 'sequence_number', v_sequence_number, 'chain_hash', v_chain_hash);
END;
$$;

COMMENT ON FUNCTION cast_link_vote(TEXT, TEXT, TEXT) IS 'sms_token: 문자 1회용 토큰 기반 익명 기표(해시체인).';

-- -----------------------------------------------------
-- 9. 권한
-- -----------------------------------------------------
GRANT EXECUTE ON FUNCTION charge_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION create_election_with_billing(TEXT, TEXT, JSONB, TEXT, UUID, UUID, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cast_member_vote(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cast_link_vote(TEXT, TEXT, TEXT) TO service_role;
