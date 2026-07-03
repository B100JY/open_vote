-- =====================================================
-- Open Vote: E2E verifiable ballot ledger
-- 시간차 공격 완화, 영수증 검증, 해시 체인 무결성 검증
-- =====================================================

ALTER TABLE ballots
    DROP COLUMN IF EXISTS created_at;

ALTER TABLE ballots
    ADD COLUMN IF NOT EXISTS sequence_number BIGINT,
    ADD COLUMN IF NOT EXISTS receipt_hash TEXT,
    ADD COLUMN IF NOT EXISTS previous_chain_hash TEXT,
    ADD COLUMN IF NOT EXISTS chain_hash TEXT;

COMMENT ON COLUMN ballots.sequence_number IS '선거별 공개 ledger 순번. 시간 정보를 저장하지 않기 위한 정렬 기준';
COMMENT ON COLUMN ballots.receipt_hash IS '클라이언트가 생성한 영수증 해시. 유권자가 공개 ledger에서 직접 검색';
COMMENT ON COLUMN ballots.previous_chain_hash IS '이전 투표 레코드의 chain_hash. 첫 표는 NULL';
COMMENT ON COLUMN ballots.chain_hash IS 'sequence/election/candidate/receipt/previous 값을 연결한 SHA-256 해시';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ballots_election_sequence
    ON ballots(election_id, sequence_number)
    WHERE sequence_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ballots_election_receipt
    ON ballots(election_id, receipt_hash)
    WHERE receipt_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ballots_chain_hash
    ON ballots(chain_hash)
    WHERE chain_hash IS NOT NULL;

DROP POLICY IF EXISTS ballots_public_read ON ballots;
DROP POLICY IF EXISTS "ballots_public_read" ON ballots;
DROP POLICY IF EXISTS "Anyone can view ballots" ON ballots;

CREATE POLICY "ballots_public_ledger_read"
    ON ballots FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE OR REPLACE FUNCTION cast_registered_vote(
    p_election_id UUID,
    p_user_id UUID,
    p_user_email TEXT,
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
        RETURN json_build_object(
            'success', false,
            'error', 'invalid_request',
            'message', '로그인 정보, 투표 항목 또는 영수증 해시가 올바르지 않습니다.'
        );
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_election_id::TEXT, 0));

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

    IF EXISTS (
        SELECT 1
        FROM ballots
        WHERE election_id = p_election_id
          AND receipt_hash = p_receipt_hash
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'duplicate_receipt',
            'message', '이미 사용된 영수증 해시입니다.'
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

    SELECT sequence_number, chain_hash
    INTO v_sequence_number, v_previous_chain_hash
    FROM ballots
    WHERE election_id = p_election_id
      AND sequence_number IS NOT NULL
      AND chain_hash IS NOT NULL
    ORDER BY sequence_number DESC
    LIMIT 1;

    v_sequence_number := COALESCE(v_sequence_number, 0) + 1;
    v_chain_hash := encode(
        digest(
            concat_ws(
                '|',
                p_election_id::TEXT,
                v_sequence_number::TEXT,
                p_selected_candidate,
                p_receipt_hash,
                COALESCE(v_previous_chain_hash, 'GENESIS')
            ),
            'sha256'
        ),
        'hex'
    );

    UPDATE voter_registry
    SET
        user_id = COALESCE(user_id, p_user_id),
        has_voted = TRUE,
        voted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_registry.id;

    INSERT INTO ballots (
        election_id,
        selected_candidate,
        sequence_number,
        receipt_hash,
        previous_chain_hash,
        chain_hash
    )
    VALUES (
        p_election_id,
        p_selected_candidate,
        v_sequence_number,
        p_receipt_hash,
        v_previous_chain_hash,
        v_chain_hash
    );

    RETURN json_build_object(
        'success', true,
        'message', '투표가 완료되었습니다.',
        'receipt_hash', p_receipt_hash,
        'sequence_number', v_sequence_number,
        'chain_hash', v_chain_hash
    );
END;
$$;

COMMENT ON FUNCTION cast_registered_vote(UUID, UUID, TEXT, TEXT, TEXT)
IS '영수증 해시와 해시 체인을 포함해 Supabase Auth 유권자 투표를 원자적으로 처리하는 함수';

CREATE OR REPLACE FUNCTION get_public_ballot_ledger(p_election_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_ballots JSON;
    v_count INTEGER;
    v_final_chain_hash TEXT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ballots
    WHERE election_id = p_election_id
      AND sequence_number IS NOT NULL;

    SELECT chain_hash INTO v_final_chain_hash
    FROM ballots
    WHERE election_id = p_election_id
      AND sequence_number IS NOT NULL
    ORDER BY sequence_number DESC
    LIMIT 1;

    SELECT json_agg(
        json_build_object(
            'sequence_number', sequence_number,
            'selected_candidate', selected_candidate,
            'receipt_hash', receipt_hash,
            'previous_chain_hash', previous_chain_hash,
            'chain_hash', chain_hash
        )
        ORDER BY sequence_number ASC
    ) INTO v_ballots
    FROM ballots
    WHERE election_id = p_election_id
      AND sequence_number IS NOT NULL;

    RETURN json_build_object(
        'election_id', p_election_id,
        'ballot_count', v_count,
        'final_chain_hash', v_final_chain_hash,
        'ballots', COALESCE(v_ballots, '[]'::JSON)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION cast_registered_vote(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_public_ballot_ledger(UUID) TO anon, authenticated, service_role;
