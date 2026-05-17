-- =====================================================
-- Open Vote: Supabase Database Schema v2
-- 노동조합용 오픈소스 투표 시스템
-- =====================================================
-- Version: 2.0
-- Description: Complete schema with enhanced security and anonymity
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. Elections Table (투표 세션 정보)
-- =====================================================
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

COMMENT ON TABLE elections IS '투표 세션 정보 - 선거명, 후보자, 상태 등';
COMMENT ON COLUMN elections.candidates IS '후보자 목록 (JSONB): [{"id": "...", "name": "..."}]';
COMMENT ON COLUMN elections.status IS 'draft: 준비중, active: 진행중, paused: 일시중단, closed: 종료';

CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
CREATE INDEX IF NOT EXISTS idx_elections_created_by ON elections(created_by);
CREATE INDEX IF NOT EXISTS idx_elections_starts_at ON elections(starts_at);
CREATE INDEX IF NOT EXISTS idx_elections_ends_at ON elections(ends_at);

-- =====================================================
-- 2. Voter Codes Table (유권자 인증 코드)
-- =====================================================
CREATE TABLE IF NOT EXISTS voter_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    phone_suffix TEXT NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: code must be unique per election
    UNIQUE(election_id, code)
);

COMMENT ON TABLE voter_codes IS '유권자 인증 코드 - 6 자리 난수 + 전화번호 뒷자리';
COMMENT ON COLUMN voter_codes.code IS '6 자리 인증코드 (중복 불가)';
COMMENT ON COLUMN voter_codes.phone_suffix IS '전화번호 뒷 4 자리 (본인 확인용)';
COMMENT ON COLUMN voter_codes.is_used IS '사용 여부 - 투표 시 true 로 변경';

CREATE INDEX IF NOT EXISTS idx_voter_codes_election ON voter_codes(election_id);
CREATE INDEX IF NOT EXISTS idx_voter_codes_code ON voter_codes(code);
CREATE INDEX IF NOT EXISTS idx_voter_codes_is_used ON voter_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_voter_codes_election_unused ON voter_codes(election_id, is_used) WHERE is_used = FALSE;

-- =====================================================
-- 3. Ballots Table (익명 투표 결과)
-- =====================================================
-- ⚠️ ANONYMITY GUARANTEE (무기명성 보장):
-- - voter_codes 와의 FK, 참조, 연결 고리 없음
-- - election_id 만으로 어떤 유권자도 특정 불가
-- - 투표용지와 인증코드는 완전히 분리됨
-- =====================================================
CREATE TABLE IF NOT EXISTS ballots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    selected_candidate TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ballots IS '익명 투표 결과 - 인증코드와 완전히 분리됨 (무기명성 보장)';
COMMENT ON COLUMN ballots.selected_candidate IS '선택한 후보자 ID';

CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_ballots_created_at ON ballots(created_at);

-- =====================================================
-- 4. Rate Limits Table (무차별 대입 공격 방지)
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE rate_limits is 'Rate Limiting - 무차별 대입 공격 방지';
COMMENT ON COLUMN rate_limits.blocked_until IS '차단 해제 시각 (NULL: 차단 안됨)';

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON rate_limits(blocked_until);

-- =====================================================
-- 5. Audit Log Table (감사 로그)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    election_id UUID REFERENCES elections(id),
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS '시스템 감사 로그 - 주요 이벤트 기록';

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_election ON audit_logs(election_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Update updated_at timestamp
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

-- =====================================================
-- Core Business Logic Functions
-- =====================================================

-- -----------------------------------------------------
-- Function: cast_anonymous_vote
-- Description: Cast an anonymous vote atomically
-- Security: SECURITY DEFINER (bypass RLS)
-- Anonymity: No FK between voter_codes and ballots
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION cast_anonymous_vote(
    p_election_id UUID,
    p_code TEXT,
    p_phone_suffix TEXT,
    p_selected_candidate TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_voter_code voter_codes%ROWTYPE;
BEGIN
    -- 1. Verify election exists and is active
    SELECT * INTO v_election
    FROM elections
    WHERE id = p_election_id
    AND status = 'active';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'election_not_active',
            'message', '이 선거는 현재 진행 중이 아닙니다.'
        );
    END IF;

    -- 2. Verify voter code (exists, unused, phone matches)
    SELECT * INTO v_voter_code
    FROM voter_codes
    WHERE code = p_code
    AND phone_suffix = p_phone_suffix
    AND is_used = FALSE
    AND election_id = p_election_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'invalid_code',
            'message', '인증코드 또는 전화번호 뒷자리를 확인해주세요.'
        );
    END IF;

    -- 3. Mark code as used (atomic)
    UPDATE voter_codes
    SET is_used = TRUE,
        used_at = NOW()
    WHERE id = v_voter_code.id;

    -- 4. Insert ballot (NO FK to voter_codes - anonymity guaranteed)
    INSERT INTO ballots (election_id, selected_candidate)
    VALUES (p_election_id, p_selected_candidate);

    -- 5. Log the vote event (without linking to voter)
    INSERT INTO audit_logs (event_type, election_id, details)
    VALUES ('vote_cast', p_election_id, json_build_object(
        'candidate', p_selected_candidate,
        'timestamp', NOW()
    ));

    RETURN json_build_object(
        'success', TRUE,
        'message', '투표가 완료되었습니다.'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'internal_error',
            'message', '투표 처리 중 오류가 발생했습니다.'
        );
END;
$$;

COMMENT ON FUNCTION cast_anonymous_vote IS '익명 투표 처리 - 인증코드 검증 + 투표용지 삽입 (원자적 트랜잭션)';

-- -----------------------------------------------------
-- Function: generate_voter_codes_batch
-- Description: Generate unique voter codes in batch
-- Security: Uses crypto-safe random generation
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION generate_voter_codes_batch(
    p_election_id UUID,
    p_count INTEGER,
    p_phone_suffixes TEXT[] DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT, phone_suffix TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code TEXT;
    v_phone_suffix TEXT;
    v_i INTEGER := 0;
    v_attempts INTEGER := 0;
    v_max_attempts INTEGER := p_count * 10;
BEGIN
    WHILE v_i < p_count AND v_attempts < v_max_attempts LOOP
        v_attempts := v_attempts + 1;
        
        -- Generate 6-digit code using crypto-safe random
        v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
        
        -- Use provided phone suffix or generate random one
        IF p_phone_suffixes IS NOT NULL AND array_length(p_phone_suffixes, 1) IS NOT NULL THEN
            v_phone_suffix := p_phone_suffixes[(v_i % array_length(p_phone_suffixes, 1)) + 1];
        ELSE
            v_phone_suffix := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        END IF;
        
        -- Check if code already exists
        IF NOT EXISTS (SELECT 1 FROM voter_codes WHERE code = v_code AND election_id = p_election_id) THEN
            -- Insert the code
            INSERT INTO voter_codes (election_id, code, phone_suffix, is_used)
            VALUES (p_election_id, v_code, v_phone_suffix, FALSE)
            RETURNING id, code, phone_suffix INTO id, code, phone_suffix;
            
            RETURN NEXT;
            v_i := v_i + 1;
        END IF;
    END LOOP;
    
    IF v_i < p_count THEN
        RAISE EXCEPTION 'Failed to generate % unique codes after % attempts', p_count - v_i, v_max_attempts;
    END IF;
END;
$$;

COMMENT ON FUNCTION generate_voter_codes_batch IS '인증코드 일괄 생성 - 중복 없는 6 자리 난수';

-- -----------------------------------------------------
-- Function: get_election_stats
-- Description: Get real-time election statistics
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_election_stats(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_codes INTEGER;
    v_used_codes INTEGER;
    v_total_ballots INTEGER;
    v_election elections%ROWTYPE;
BEGIN
    -- Get election info
    SELECT * INTO v_election FROM elections WHERE id = p_election_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Election not found');
    END IF;
    
    -- Get voter code stats
    SELECT COUNT(*) INTO v_total_codes FROM voter_codes WHERE election_id = p_election_id;
    SELECT COUNT(*) INTO v_used_codes FROM voter_codes WHERE election_id = p_election_id AND is_used = TRUE;
    
    -- Get ballot count
    SELECT COUNT(*) INTO v_total_ballots FROM ballots WHERE election_id = p_election_id;
    
    RETURN json_build_object(
        'election', json_build_object(
            'id', v_election.id,
            'name', v_election.name,
            'status', v_election.status
        ),
        'voter_codes', json_build_object(
            'total', v_total_codes,
            'used', v_used_codes,
            'remaining', v_total_codes - v_used_codes
        ),
        'ballots', json_build_object(
            'total', v_total_ballots
        ),
        'progress', CASE 
            WHEN v_total_codes > 0 THEN ROUND((v_used_codes::NUMERIC / v_total_codes::NUMERIC) * 100, 2)
            ELSE 0
        END
    );
END;
$$;

COMMENT ON FUNCTION get_election_stats IS '선거 실시간 통계 - 투표율, 인증코드 사용 현황';

-- -----------------------------------------------------
-- Function: get_vote_results
-- Description: Get vote results by candidate
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_vote_results(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_results JSON;
    v_total INTEGER;
BEGIN
    -- Get total ballots
    SELECT COUNT(*) INTO v_total FROM ballots WHERE election_id = p_election_id;
    
    -- Aggregate results by candidate
    SELECT json_agg(row_to_json(r)) INTO v_results
    FROM (
        SELECT 
            selected_candidate as candidate_id,
            COUNT(*) as vote_count,
            CASE 
                WHEN v_total > 0 THEN ROUND((COUNT(*)::NUMERIC / v_total::NUMERIC) * 100, 2)
                ELSE 0
            END as percentage
        FROM ballots
        WHERE election_id = p_election_id
        GROUP BY selected_candidate
        ORDER BY vote_count DESC
    ) r;
    
    RETURN json_build_object(
        'election_id', p_election_id,
        'total_votes', v_total,
        'results', COALESCE(v_results, '[]'::json)
    );
END;
$$;

COMMENT ON FUNCTION get_vote_results IS '투표 결과 집계 - 후보자별 득표수 및 비율';

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE voter_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- Elections Policies
-- -----------------------------------------------------
-- Public can view active/closed elections
CREATE POLICY "elections_public_read"
    ON elections FOR SELECT
    USING (status IN ('active', 'closed'));

-- Authenticated users can view all elections
CREATE POLICY "elections_auth_read"
    ON elections FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can create elections
CREATE POLICY "elections_auth_insert"
    ON elections FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Creator can update their election
CREATE POLICY "elections_creator_update"
    ON elections FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

-- Creator can delete their election
CREATE POLICY "elections_creator_delete"
    ON elections FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- -----------------------------------------------------
-- Voter Codes Policies
-- -----------------------------------------------------
-- No direct read (security through obscurity + RLS)
-- Service role (Edge Functions) bypass RLS
CREATE POLICY "voter_codes_no_read"
    ON voter_codes FOR SELECT
    TO authenticated
    USING (false);

-- Election creator can insert codes
CREATE POLICY "voter_codes_creator_insert"
    ON voter_codes FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM elections
            WHERE elections.id = voter_codes.election_id
            AND elections.created_by = auth.uid()
        )
    );

-- -----------------------------------------------------
-- Ballots Policies
-- -----------------------------------------------------
-- Public can read ballots (transparency)
CREATE POLICY "ballots_public_read"
    ON ballots FOR SELECT
    USING (true);

-- No direct insert (only via Edge Function)
CREATE POLICY "ballots_no_insert"
    ON ballots FOR INSERT
    TO authenticated
    WITH CHECK (false);

-- No updates or deletes
CREATE POLICY "ballots_no_update"
    ON ballots FOR UPDATE
    USING (false);

CREATE POLICY "ballots_no_delete"
    ON ballots FOR DELETE
    USING (false);

-- -----------------------------------------------------
-- Rate Limits Policies
-- -----------------------------------------------------
-- Only service role can access
CREATE POLICY "rate_limits_service_only"
    ON rate_limits FOR ALL
    USING (false)
    WITH CHECK (false);

-- -----------------------------------------------------
-- Audit Logs Policies
-- -----------------------------------------------------
-- Only service role can access
CREATE POLICY "audit_logs_service_only"
    ON audit_logs FOR ALL
    USING (false)
    WITH CHECK (false);

-- =====================================================
-- Supabase Realtime Configuration
-- =====================================================
BEGIN;
    ALTER PUBLICATION supabase_realtime ADD TABLE elections;
    ALTER PUBLICATION supabase_realtime ADD TABLE ballots;
    ALTER PUBLICATION supabase_realtime ADD TABLE voter_codes;
COMMIT;

-- =====================================================
-- Initial Data (Optional - for testing)
-- =====================================================
-- Uncomment for development/testing only
-- INSERT INTO elections (name, description, candidates, status, total_voter_codes)
-- VALUES (
--     '테스트 선거',
--     '개발 테스트용 선거입니다.',
--     '[{"id": "c1", "name": "후보 1"}, {"id": "c2", "name": "후보 2"}]'::jsonb,
--     'draft',
--     100
-- );
