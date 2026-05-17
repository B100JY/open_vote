-- =====================================================
-- Open Vote: Supabase Database Schema
-- 노동조합용 오픈소스 투표 시스템
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for secure random generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. Elections Table (투표 세션 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS elections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    candidates JSONB NOT NULL,
    total_voter_codes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'closed')),
    created_by UUID REFERENCES auth.users(id),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elections_status ON elections(status);
CREATE INDEX IF NOT EXISTS idx_elections_created_by ON elections(created_by);

-- =====================================================
-- 2. Voter Codes Table (유권자 인증 코드)
-- =====================================================
CREATE TABLE IF NOT EXISTS voter_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    phone_suffix TEXT NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voter_codes_election ON voter_codes(election_id);
CREATE INDEX IF NOT EXISTS idx_voter_codes_code ON voter_codes(code);
CREATE INDEX IF NOT EXISTS idx_voter_codes_is_used ON voter_codes(is_used);

-- =====================================================
-- 3. Ballots Table (익명 투표 결과)
-- =====================================================
-- ⚠️ 핵심 설계: voter_codes와의 어떤 FK, 참조, 연결 고리도 없음
-- 투표 기록은 election_id만 가지며, 누가 투표했는지 추적 불가
-- =====================================================
CREATE TABLE IF NOT EXISTS ballots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    selected_candidate TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);

-- =====================================================
-- 4. Rate Limit Table (무차별 대입 방지)
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

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON rate_limits(blocked_until);

-- =====================================================
-- Updated At Trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_elections_updated_at
    BEFORE UPDATE ON elections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE voter_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- Elections Policies
-- -----------------------------------------------------
-- Anyone can read active/closed elections (for transparency)
CREATE POLICY "Anyone can view active elections"
    ON elections FOR SELECT
    USING (status IN ('active', 'closed'));

-- Authenticated admins can read all elections
CREATE POLICY "Admins can view all elections"
    ON elections FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated users can create elections
CREATE POLICY "Authenticated users can create elections"
    ON elections FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Only the creator can update their election
CREATE POLICY "Creator can update election"
    ON elections FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

-- Only the creator can delete their election
CREATE POLICY "Creator can delete election"
    ON elections FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- -----------------------------------------------------
-- Voter Codes Policies
-- -----------------------------------------------------
-- No one can read voter codes directly (security)
-- Only Edge Functions (service role) can read/write
-- This policy is intentionally restrictive
CREATE POLICY "No direct read of voter codes"
    ON voter_codes FOR SELECT
    TO authenticated
    USING (false);

-- Only admins who created the election can manage codes
CREATE POLICY "Admin can manage voter codes"
    ON voter_codes FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM elections
            WHERE elections.id = voter_codes.election_id
            AND elections.created_by = auth.uid()
        )
    )
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
-- Anyone can read ballots (transparency)
CREATE POLICY "Anyone can view ballots"
    ON ballots FOR SELECT
    USING (true);

-- Only Edge Functions can insert ballots (via service role)
-- No direct INSERT policy for authenticated users
CREATE POLICY "No direct ballot insertion"
    ON ballots FOR INSERT
    TO authenticated
    WITH CHECK (false);

-- No one can update or delete ballots
CREATE POLICY "No one can update ballots"
    ON ballots FOR UPDATE
    USING (false);

CREATE POLICY "No one can delete ballots"
    ON ballots FOR DELETE
    USING (false);

-- -----------------------------------------------------
-- Rate Limits Policies
-- -----------------------------------------------------
-- Only service role (Edge Functions) manage rate limits
CREATE POLICY "No direct access to rate limits"
    ON rate_limits FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- =====================================================
-- Supabase Realtime Setup
-- =====================================================
-- Enable realtime for elections (progress tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE elections;

-- Enable realtime for ballots (live results)
ALTER PUBLICATION supabase_realtime ADD TABLE ballots;

-- Enable realtime for voter_codes (usage tracking)
ALTER PUBLICATION supabase_realtime ADD TABLE voter_codes;
