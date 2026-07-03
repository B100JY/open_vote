-- =====================================================
-- Open Vote - 원클릭 설정 스크립트
-- 프로젝트: zxrwlwhbcivwpvmktuoj
-- =====================================================
-- 사용법: Supabase SQL Editor 에서 전체 복사 후 실행
-- =====================================================

-- 1. 확장 프로그램 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. 테이블 생성
CREATE TABLE IF NOT EXISTS elections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_voter_codes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'closed')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voter_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    phone_suffix TEXT NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(election_id, code)
);

CREATE TABLE IF NOT EXISTS ballots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    selected_candidate TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
CREATE INDEX IF NOT EXISTS idx_elections_created_by ON elections(created_by);
CREATE INDEX IF NOT EXISTS idx_voter_codes_election ON voter_codes(election_id);
CREATE INDEX IF NOT EXISTS idx_voter_codes_code ON voter_codes(code);
CREATE INDEX IF NOT EXISTS idx_voter_codes_is_used ON voter_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);

-- 4. Helper 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER update_elections_updated_at
    BEFORE UPDATE ON elections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. 핵심 비즈니스 함수들

-- 5.1 익명 투표 처리 함수
CREATE OR REPLACE FUNCTION cast_anonymous_vote(
    p_election_id UUID,
    p_code TEXT,
    p_phone_suffix TEXT,
    p_selected_candidate TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_voter_code voter_codes%ROWTYPE;
BEGIN
    SELECT * INTO v_election FROM elections
    WHERE id = p_election_id AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'election_not_active', 'message', '이 선거는 현재 진행 중이 아닙니다.');
    END IF;

    SELECT * INTO v_voter_code FROM voter_codes
    WHERE code = p_code AND phone_suffix = p_phone_suffix AND is_used = FALSE AND election_id = p_election_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', FALSE, 'error', 'invalid_code', 'message', '인증코드 또는 전화번호 뒷자리를 확인해주세요.');
    END IF;

    UPDATE voter_codes SET is_used = TRUE, used_at = NOW() WHERE id = v_voter_code.id;
    INSERT INTO ballots (election_id, selected_candidate) VALUES (p_election_id, p_selected_candidate);

    RETURN json_build_object('success', TRUE, 'message', '투표가 완료되었습니다.');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', FALSE, 'error', 'internal_error', 'message', '투표 처리 중 오류가 발생했습니다.');
END;
$$;

-- 5.2 인증코드 일괄 생성 함수
CREATE OR REPLACE FUNCTION generate_voter_codes_batch(
    p_election_id UUID,
    p_count INTEGER,
    p_phone_suffixes TEXT[] DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT, phone_suffix TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code TEXT;
    v_phone_suffix TEXT;
    v_i INTEGER := 0;
    v_attempts INTEGER := 0;
BEGIN
    WHILE v_i < p_count AND v_attempts < p_count * 10 LOOP
        v_attempts := v_attempts + 1;
        v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
        
        IF p_phone_suffixes IS NOT NULL AND array_length(p_phone_suffixes, 1) IS NOT NULL THEN
            v_phone_suffix := p_phone_suffixes[(v_i % array_length(p_phone_suffixes, 1)) + 1];
        ELSE
            v_phone_suffix := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM voter_codes WHERE code = v_code AND election_id = p_election_id) THEN
            INSERT INTO voter_codes (election_id, code, phone_suffix, is_used)
            VALUES (p_election_id, v_code, v_phone_suffix, FALSE)
            RETURNING id, code, phone_suffix INTO id, code, phone_suffix;
            
            RETURN NEXT;
            v_i := v_i + 1;
        END IF;
    END LOOP;
END;
$$;

-- 5.3 투표 결과 집계 함수
CREATE OR REPLACE FUNCTION get_vote_results(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_results JSON;
    v_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM ballots WHERE election_id = p_election_id;
    
    SELECT json_agg(row_to_json(r)) INTO v_results
    FROM (
        SELECT selected_candidate as candidate_id, COUNT(*) as vote_count,
            CASE WHEN v_total > 0 THEN ROUND((COUNT(*)::NUMERIC / v_total::NUMERIC) * 100, 2) ELSE 0 END as percentage
        FROM ballots WHERE election_id = p_election_id
        GROUP BY selected_candidate ORDER BY vote_count DESC
    ) r;
    
    RETURN json_build_object('election_id', p_election_id, 'total_votes', v_total, 'results', COALESCE(v_results, '[]'::json));
END;
$$;

-- 5.4 선거 통계 함수
CREATE OR REPLACE FUNCTION get_election_stats(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_codes INTEGER;
    v_used_codes INTEGER;
    v_total_ballots INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_codes FROM voter_codes WHERE election_id = p_election_id;
    SELECT COUNT(*) INTO v_used_codes FROM voter_codes WHERE election_id = p_election_id AND is_used = TRUE;
    SELECT COUNT(*) INTO v_total_ballots FROM ballots WHERE election_id = p_election_id;
    
    RETURN json_build_object(
        'total_codes', v_total_codes,
        'used_codes', v_used_codes,
        'remaining_codes', v_total_codes - v_used_codes,
        'total_ballots', v_total_ballots,
        'progress', CASE WHEN v_total_codes > 0 THEN ROUND((v_used_codes::NUMERIC / v_total_codes::NUMERIC) * 100, 2) ELSE 0 END
    );
END;
$$;

-- 5.5 Rate Limit 기록 함수
CREATE OR REPLACE FUNCTION record_rate_limit_attempt(
    p_ip_address TEXT,
    p_endpoint TEXT,
    p_max_attempts INTEGER,
    p_block_duration_ms INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO rate_limits (ip_address, endpoint, attempt_count, last_attempt_at)
    VALUES (p_ip_address, p_endpoint, 1, NOW())
    ON CONFLICT (id) DO UPDATE SET attempt_count = rate_limits.attempt_count + 1, last_attempt_at = NOW();
    
    IF (SELECT attempt_count FROM rate_limits WHERE ip_address = p_ip_address AND endpoint = p_endpoint) >= p_max_attempts THEN
        UPDATE rate_limits SET blocked_until = NOW() + (p_block_duration_ms / 1000.0) * INTERVAL '1 second'
        WHERE ip_address = p_ip_address AND endpoint = p_endpoint;
    END IF;
END;
$$;

-- 6. RLS (Row Level Security) 설정

ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE voter_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Elections 정책
DROP POLICY IF EXISTS elections_public_read ON elections;
DROP POLICY IF EXISTS elections_auth_read ON elections;
DROP POLICY IF EXISTS elections_auth_insert ON elections;
DROP POLICY IF EXISTS elections_creator_update ON elections;

CREATE POLICY "elections_public_read" ON elections FOR SELECT USING (status IN ('active', 'closed'));
CREATE POLICY "elections_auth_read" ON elections FOR SELECT TO authenticated USING (true);
CREATE POLICY "elections_auth_insert" ON elections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "elections_creator_update" ON elections FOR UPDATE TO authenticated USING (true);

-- Voter Codes 정책
DROP POLICY IF EXISTS voter_codes_no_read ON voter_codes;
DROP POLICY IF EXISTS voter_codes_creator_insert ON voter_codes;

CREATE POLICY "voter_codes_no_read" ON voter_codes FOR SELECT TO authenticated USING (false);
CREATE POLICY "voter_codes_creator_insert" ON voter_codes FOR INSERT TO authenticated WITH CHECK (true);

-- Ballots 정책
DROP POLICY IF EXISTS ballots_public_read ON ballots;
DROP POLICY IF EXISTS ballots_no_insert ON ballots;
DROP POLICY IF EXISTS ballots_no_update ON ballots;
DROP POLICY IF EXISTS ballots_no_delete ON ballots;

CREATE POLICY "ballots_public_read" ON ballots FOR SELECT USING (true);
CREATE POLICY "ballots_no_insert" ON ballots FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "ballots_no_update" ON ballots FOR UPDATE USING (false);
CREATE POLICY "ballots_no_delete" ON ballots FOR DELETE USING (false);

-- Rate Limits 정책
DROP POLICY IF EXISTS rate_limits_service_only ON rate_limits;
CREATE POLICY "rate_limits_service_only" ON rate_limits FOR ALL USING (false) WITH CHECK (false);

-- Data API 권한 명시
-- Supabase 신규 프로젝트에서 public schema 자동 노출/권한 부여 기본값이 바뀌어도
-- 서버 API(service_role)와 공개 Realtime(elections, ballots)이 동일하게 동작하도록 설정합니다.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON elections, ballots TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON elections, voter_codes, ballots, rate_limits, audit_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE rate_limits_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION cast_anonymous_vote(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION generate_voter_codes_batch(UUID, INTEGER, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION get_vote_results(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_election_stats(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION record_rate_limit_attempt(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- 7. Realtime 설정
BEGIN;
    ALTER PUBLICATION supabase_realtime ADD TABLE elections;
    ALTER PUBLICATION supabase_realtime ADD TABLE ballots;
    ALTER PUBLICATION supabase_realtime ADD TABLE voter_codes;
COMMIT;

-- 8. 설정 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '✅ Open Vote 데이터베이스 설정이 완료되었습니다!';
    RAISE NOTICE '테이블: elections, voter_codes, ballots, rate_limits';
    RAISE NOTICE '함수: cast_anonymous_vote, generate_voter_codes_batch, get_vote_results, get_election_stats';
    RAISE NOTICE 'RLS 정책이 활성화되었습니다.';
    RAISE NOTICE 'Realtime 이 설정되었습니다.';
END $$;
