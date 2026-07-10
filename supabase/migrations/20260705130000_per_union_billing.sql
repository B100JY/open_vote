-- 조합별 과금 분리
-- 기존 create_election_with_billing 은 API 키 소유자 지갑(point_wallets)에서 차감했다.
-- 이 마이그레이션은 연동 조합(nozolink_union_id)별 지갑(union_point_wallets)에서 차감하도록 바꾼다.
-- 반드시 20260705120000_nozolink_integration.sql 이후에 적용한다. 재실행 가능(idempotent).

-- app_open_vote 스키마 비한정 참조(elections 등)와 확장 함수(extensions 스키마)를 위해 search_path 명시.
SET search_path = app_open_vote, public, extensions;

-- -----------------------------------------------------
-- 1. 조합별 지갑 + 원장
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS union_point_wallets (
    union_id UUID PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE union_point_wallets ADD COLUMN IF NOT EXISTS balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE union_point_wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
COMMENT ON TABLE union_point_wallets IS 'nozolink 조합별 선불 포인트 잔액. union_id 는 app_nozolink.unions 논리 참조.';

CREATE TABLE IF NOT EXISTS union_point_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    union_id UUID NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    election_id UUID REFERENCES elections(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS union_id UUID;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS delta INTEGER;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS balance_after INTEGER;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS election_id UUID;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE union_point_ledger ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_union_point_ledger_union ON union_point_ledger(union_id, created_at DESC);

ALTER TABLE union_point_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE union_point_ledger ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON union_point_wallets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON union_point_ledger TO service_role;

-- -----------------------------------------------------
-- 2. RPC: charge_union_points (조합 지갑 충전/차감)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION charge_union_points(
    p_union_id UUID,
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
    IF p_union_id IS NULL OR p_amount IS NULL OR p_amount = 0 THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '대상 조합 또는 금액이 올바르지 않습니다.');
    END IF;

    INSERT INTO union_point_wallets (union_id, balance)
    VALUES (p_union_id, 0)
    ON CONFLICT (union_id) DO NOTHING;

    SELECT balance INTO v_balance FROM union_point_wallets WHERE union_id = p_union_id FOR UPDATE;

    IF v_balance + p_amount < 0 THEN
        RETURN json_build_object('success', false, 'error', 'insufficient_points', 'message', '포인트 잔액이 부족합니다.', 'balance', v_balance, 'required', -p_amount);
    END IF;

    v_balance := v_balance + p_amount;
    UPDATE union_point_wallets SET balance = v_balance, updated_at = NOW() WHERE union_id = p_union_id;

    INSERT INTO union_point_ledger (union_id, delta, balance_after, reason, election_id, created_by, memo)
    VALUES (p_union_id, p_amount, v_balance, COALESCE(p_reason, 'charge'), p_election_id, p_actor, p_memo);

    RETURN json_build_object('success', true, 'balance', v_balance, 'delta', p_amount);
END;
$$;

COMMENT ON FUNCTION charge_union_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID) IS '조합별 선불 포인트 충전/차감(원자적).';

-- -----------------------------------------------------
-- 3. create_election_with_billing 재정의: 조합 지갑에서 차감
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

    -- 과금(중요 안건만): 연동 조합 지갑에서 유권자당 포인트 선불 차감
    IF p_auth_mode = 'sms_token' THEN
        IF p_nozolink_union_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'union_required', 'message', '중요 안건은 연동 조합 정보가 필요합니다.');
        END IF;

        v_cost := v_voter_count * GREATEST(p_credit_per_voter, 0);

        INSERT INTO union_point_wallets (union_id, balance)
        VALUES (p_nozolink_union_id, 0)
        ON CONFLICT (union_id) DO NOTHING;

        SELECT balance INTO v_balance FROM union_point_wallets WHERE union_id = p_nozolink_union_id FOR UPDATE;

        IF v_balance < v_cost THEN
            RETURN json_build_object('success', false, 'error', 'insufficient_points', 'message', '포인트 잔액이 부족합니다. 충전 후 다시 시도해주세요.', 'required', v_cost, 'balance', v_balance);
        END IF;
    END IF;

    INSERT INTO elections (
        name, description, candidates, total_voter_codes, status,
        auth_mode, nozolink_union_id, credit_per_voter, billed_owner_user_id, billed_points,
        created_by, starts_at, ends_at
    )
    VALUES (
        trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_candidates, v_voter_count, 'draft',
        p_auth_mode, p_nozolink_union_id,
        CASE WHEN p_auth_mode = 'sms_token' THEN p_credit_per_voter ELSE 0 END,
        NULL,
        v_cost,
        p_created_by, p_starts_at, p_ends_at
    )
    RETURNING id INTO v_election_id;

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
                'registry_id', v_registry_id, 'phone', v_phone, 'token', v_token, 'name', COALESCE(v_voter ->> 'name', '')
            );
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_voter_count FROM voter_registry WHERE election_id = v_election_id;

    IF p_auth_mode = 'sms_token' THEN
        v_cost := v_voter_count * GREATEST(p_credit_per_voter, 0);
        v_charge := charge_union_points(p_nozolink_union_id, -v_cost, 'election_charge', p_created_by, p_name, v_election_id);
        IF (v_charge ->> 'success')::BOOLEAN IS NOT TRUE THEN
            DELETE FROM elections WHERE id = v_election_id;
            RETURN v_charge;
        END IF;
        UPDATE elections SET total_voter_codes = v_voter_count, billed_points = v_cost WHERE id = v_election_id;
    ELSE
        UPDATE elections SET total_voter_codes = v_voter_count WHERE id = v_election_id;
    END IF;

    INSERT INTO audit_logs (event_type, election_id, details)
    VALUES ('external_election_created', v_election_id, jsonb_build_object(
        'auth_mode', p_auth_mode, 'union_id', p_nozolink_union_id, 'voter_count', v_voter_count,
        'charged', v_cost, 'actor', p_created_by
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

GRANT EXECUTE ON FUNCTION charge_union_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION create_election_with_billing(TEXT, TEXT, JSONB, TEXT, UUID, UUID, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO service_role;
