-- =====================================================
-- Open Vote: Supabase Auth based voter registry
-- 인증(Identity)과 기표(Ballot)를 분리하는 패스워드리스 모델
-- =====================================================

CREATE TABLE IF NOT EXISTS voter_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    has_voted BOOLEAN NOT NULL DEFAULT FALSE,
    invited_at TIMESTAMPTZ,
    voted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT voter_registry_email_not_blank CHECK (length(trim(email)) > 0)
);

COMMENT ON TABLE voter_registry IS '선거별 유권자 참여 상태 - 투표 내용과 분리된 인증/참여 기록';
COMMENT ON COLUMN voter_registry.user_id IS 'Supabase Auth 사용자 ID. 최초 로그인 전에는 NULL일 수 있음';
COMMENT ON COLUMN voter_registry.email IS '매직 링크/OTP 발송 대상 이메일';
COMMENT ON COLUMN voter_registry.has_voted IS '이 유권자가 해당 선거에서 투표권을 행사했는지 여부';

CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_election_email
    ON voter_registry(election_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_election_user
    ON voter_registry(election_id, user_id)
    WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voter_registry_election_voted
    ON voter_registry(election_id, has_voted);
CREATE INDEX IF NOT EXISTS idx_voter_registry_user
    ON voter_registry(user_id)
    WHERE user_id IS NOT NULL;

ALTER TABLE voter_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voter_registry_self_read" ON voter_registry;
DROP POLICY IF EXISTS "voter_registry_no_insert" ON voter_registry;
DROP POLICY IF EXISTS "voter_registry_no_update" ON voter_registry;
DROP POLICY IF EXISTS "voter_registry_no_delete" ON voter_registry;

CREATE POLICY "voter_registry_self_read"
    ON voter_registry FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR lower(email) = lower((auth.jwt() ->> 'email'))
    );

CREATE POLICY "voter_registry_no_insert"
    ON voter_registry FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY "voter_registry_no_update"
    ON voter_registry FOR UPDATE
    TO authenticated
    USING (false)
    WITH CHECK (false);

CREATE POLICY "voter_registry_no_delete"
    ON voter_registry FOR DELETE
    TO authenticated
    USING (false);

-- =====================================================
-- Function: cast_registered_vote
-- Supabase Auth 사용자와 voter_registry 참여 상태를 확인한 뒤
-- has_voted 갱신과 익명 ballots 삽입을 하나의 트랜잭션으로 처리합니다.
-- ballots에는 user_id/email을 저장하지 않습니다.
-- =====================================================
CREATE OR REPLACE FUNCTION cast_registered_vote(
    p_election_id UUID,
    p_user_id UUID,
    p_user_email TEXT,
    p_selected_candidate TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_registry voter_registry%ROWTYPE;
    v_candidate_exists BOOLEAN;
BEGIN
    IF p_user_id IS NULL OR p_selected_candidate IS NULL OR trim(p_selected_candidate) = '' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'invalid_request',
            'message', '로그인 정보 또는 투표 항목이 올바르지 않습니다.'
        );
    END IF;

    SELECT * INTO v_election
    FROM elections
    WHERE id = p_election_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'election_not_found',
            'message', '선거 정보를 찾을 수 없습니다.'
        );
    END IF;

    IF v_election.status != 'active' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'election_not_active',
            'message', '이 선거는 현재 진행 중이 아닙니다.'
        );
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_election.candidates) AS candidate
        WHERE candidate ->> 'id' = p_selected_candidate
    ) INTO v_candidate_exists;

    IF NOT v_candidate_exists THEN
        RETURN json_build_object(
            'success', false,
            'error', 'invalid_candidate',
            'message', '선택할 수 없는 항목입니다.'
        );
    END IF;

    SELECT * INTO v_registry
    FROM voter_registry
    WHERE election_id = p_election_id
      AND (
        user_id = p_user_id
        OR lower(email) = lower(coalesce(p_user_email, ''))
      )
    ORDER BY CASE WHEN user_id = p_user_id THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'not_registered',
            'message', '이 선거에 등록된 유권자가 아닙니다.'
        );
    END IF;

    IF v_registry.has_voted THEN
        RETURN json_build_object(
            'success', false,
            'error', 'already_voted',
            'message', '이미 투표를 완료했습니다.'
        );
    END IF;

    UPDATE voter_registry
    SET
        user_id = COALESCE(user_id, p_user_id),
        has_voted = TRUE,
        voted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_registry.id;

    INSERT INTO ballots (election_id, selected_candidate)
    VALUES (p_election_id, p_selected_candidate);

    RETURN json_build_object(
        'success', true,
        'message', '투표가 완료되었습니다.'
    );
END;
$$;

COMMENT ON FUNCTION cast_registered_vote(UUID, UUID, TEXT, TEXT)
IS 'Supabase Auth 유권자 상태와 익명 투표지를 원자적으로 처리하는 함수';

-- Registry 기반 통계. 기존 UI 호환을 위해 voter_codes 키도 동일 값으로 유지합니다.
CREATE OR REPLACE FUNCTION get_election_stats(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election RECORD;
    v_total_registry INTEGER;
    v_used_registry INTEGER;
    v_total_codes INTEGER;
    v_used_codes INTEGER;
    v_total_ballots INTEGER;
    v_total_voters INTEGER;
    v_used_voters INTEGER;
    v_remaining INTEGER;
    v_progress NUMERIC;
BEGIN
    SELECT id, name, status INTO v_election
    FROM elections
    WHERE id = p_election_id;

    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Election not found');
    END IF;

    SELECT COUNT(*) INTO v_total_registry
    FROM voter_registry
    WHERE election_id = p_election_id;

    SELECT COUNT(*) INTO v_used_registry
    FROM voter_registry
    WHERE election_id = p_election_id
      AND has_voted = TRUE;

    SELECT COUNT(*) INTO v_total_codes
    FROM voter_codes
    WHERE election_id = p_election_id;

    SELECT COUNT(*) INTO v_used_codes
    FROM voter_codes
    WHERE election_id = p_election_id
      AND is_used = TRUE;

    SELECT COUNT(*) INTO v_total_ballots
    FROM ballots
    WHERE election_id = p_election_id;

    v_total_voters := CASE WHEN v_total_registry > 0 THEN v_total_registry ELSE v_total_codes END;
    v_used_voters := CASE WHEN v_total_registry > 0 THEN v_used_registry ELSE v_used_codes END;
    v_remaining := GREATEST(v_total_voters - v_used_voters, 0);
    v_progress := CASE
        WHEN v_total_voters > 0 THEN round((v_used_voters::NUMERIC / v_total_voters::NUMERIC) * 100, 2)
        ELSE 0
    END;

    RETURN json_build_object(
        'election', json_build_object(
            'id', v_election.id,
            'name', v_election.name,
            'status', v_election.status
        ),
        'voter_registry', json_build_object(
            'total', v_total_registry,
            'used', v_used_registry,
            'remaining', GREATEST(v_total_registry - v_used_registry, 0)
        ),
        'voter_codes', json_build_object(
            'total', v_total_voters,
            'used', v_used_voters,
            'remaining', v_remaining
        ),
        'ballots', json_build_object(
            'total', v_total_ballots
        ),
        'progress', v_progress
    );
END;
$$;

GRANT SELECT ON voter_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON voter_registry TO service_role;
GRANT EXECUTE ON FUNCTION cast_registered_vote(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_election_stats(UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE voter_registry;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
