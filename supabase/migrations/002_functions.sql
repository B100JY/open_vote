-- =====================================================
-- Open Vote: Database Functions for Anonymous Voting
-- =====================================================

-- Function to cast an anonymous vote (used by Edge Function)
-- This function ensures that:
-- 1. The authentication code is valid and not used
-- 2. The phone suffix matches
-- 3. The election is active
-- 4. The code is marked as used
-- 5. The ballot is inserted
-- All in a single transaction with no referential integrity
-- between voter_codes and ballots
-- =====================================================
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
    v_result JSON;
BEGIN
    -- Start transaction
    BEGIN
        -- 1. Verify election exists and is active
        SELECT * INTO v_election
        FROM elections
        WHERE id = p_election_id
        AND status = 'active';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Election not found or not active';
        END IF;

        -- 2. Verify voter code exists, is not used, and phone suffix matches
        SELECT * INTO v_voter_code
        FROM voter_codes
        WHERE code = p_code
        AND phone_suffix = p_phone_suffix
        AND is_used = FALSE
        AND election_id = p_election_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid authentication code';
        END IF;

        -- 3. Mark the code as used
        UPDATE voter_codes
        SET is_used = TRUE,
            used_at = NOW()
        WHERE id = v_voter_code.id;

        -- 4. Insert the ballot (no FK to voter_codes)
        INSERT INTO ballots (election_id, selected_candidate, created_at)
        VALUES (p_election_id, p_selected_candidate, NOW());

        -- 5. Return success
        v_result := json_build_object(
            'success', TRUE,
            'message', 'Vote cast successfully'
        );

        RETURN v_result;

    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback is automatic in PostgreSQL
            v_result := json_build_object(
                'success', FALSE,
                'message', SQLERRM
            );

            RETURN v_result;
    END;
END;
$$;

-- Function to record rate limit attempts
-- =====================================================
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
DECLARE
    v_count INTEGER;
BEGIN
    -- Count existing attempts for this IP and endpoint
    SELECT COUNT(*) INTO v_count
    FROM rate_limits
    WHERE ip_address = p_ip_address
    AND endpoint = p_endpoint
    AND blocked_until IS NULL
    OR blocked_until < NOW();

    -- Update or insert rate limit record
    IF v_count > 0 THEN
        UPDATE rate_limits
        SET attempt_count = attempt_count + 1,
            last_attempt_at = NOW()
        WHERE ip_address = p_ip_address
        AND endpoint = p_endpoint;

        -- Check if we need to block
        IF v_count >= p_max_attempts THEN
            UPDATE rate_limits
            SET blocked_until = NOW() + (p_block_duration_ms / 1000) * INTERVAL '1 second'
            WHERE ip_address = p_ip_address
            AND endpoint = p_endpoint;
        END IF;
    ELSE
        INSERT INTO rate_limits (ip_address, endpoint, attempt_count, last_attempt_at)
        VALUES (p_ip_address, p_endpoint, 1, NOW());
    END IF;
END;
$$;

-- Function to get vote count for an election
-- =====================================================
CREATE OR REPLACE FUNCTION get_vote_count(
    p_election_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM ballots
    WHERE election_id = p_election_id;

    RETURN v_count;
END;
$$;

-- Function to generate voter codes (used by admin)
-- =====================================================
CREATE OR REPLACE FUNCTION generate_voter_codes(
    p_election_id UUID,
    p_count INTEGER
)
RETURNS TABLE(id UUID, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code TEXT;
    v_exists BOOLEAN;
    v_i INTEGER := 0;
BEGIN
    WHILE v_i < p_count LOOP
        -- Generate a 6-digit random code
        v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

        -- Check if code already exists
        SELECT EXISTS(SELECT 1 FROM voter_codes WHERE code = v_code) INTO v_exists;

        IF NOT v_exists THEN
            -- Insert the code
            INSERT INTO voter_codes (election_id, code, phone_suffix, is_used)
            VALUES (p_election_id, v_code, '', FALSE);

            -- Return the generated code
            id := (SELECT id FROM voter_codes WHERE code = v_code);
            code := v_code;
            RETURN NEXT;

            v_i := v_i + 1;
        END IF;
    END LOOP;
END;
$$;
