-- =====================================================
-- Open Vote ↔ nozolink 연동: 투표 수정/삭제(투표 0건일 때만)
-- =====================================================
-- 실수로 만든 연동 선거를 바로잡기 위한 서버-서버 RPC 2종.
--   * update_integration_election : 제목/설명/후보/시작·마감 수정(cast=0 필수).
--   * delete_integration_election : 삭제 + sms_token 선불 포인트 조합 지갑 환불(cast=0 필수, 원자적).
-- 불변식:
--   - 연동 선거(nozolink_union_id IS NOT NULL)에만 동작한다.
--   - 집계된 표(ballots)가 1건이라도 있으면 무결성·감사 보존을 위해 거부('has_votes')한다.
--   - 후보(candidates) 교체는 0표일 때만 허용(위 가드로 보장)하며 후보 id를 재생성할 수 있다.
--   - 삭제는 하드 삭제(선거 + 명부/후보 제거)이며, 감사 로그는 election_id 참조만 끊어 보존한다.
-- 모든 구문은 재실행 가능(idempotent)하도록 작성한다. 적용은 사람이 한다(자동 적용 금지).
-- =====================================================

-- app_open_vote 스키마 비한정 참조(elections 등)와 확장 함수(extensions)를 위해 search_path 명시.
SET search_path = app_open_vote, public, extensions;

-- (참고) 연동 선거 자동 조회 성능: (election_id, auth_user_id)는 nozolink_integration 에서 이미 생성.
-- 재실행 가능하도록 방어적으로 한 번 더 보장한다(voter-status 배치 조회용).
CREATE UNIQUE INDEX IF NOT EXISTS idx_voter_registry_election_auth_user
    ON voter_registry(election_id, auth_user_id) WHERE auth_user_id IS NOT NULL;

-- -----------------------------------------------------
-- 1. RPC: update_integration_election
--    NULL 인자는 "변경 안 함". 제공된 필드만 갱신한다.
--    p_candidates 제공 시 array 이고 최소 1개여야 한다(0표일 때만 도달).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION update_integration_election(
    p_election_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_candidates JSONB DEFAULT NULL,
    p_starts_at TIMESTAMPTZ DEFAULT NULL,
    p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_cast INTEGER;
    v_voter_count INTEGER;
    v_new_starts TIMESTAMPTZ;
    v_new_ends TIMESTAMPTZ;
BEGIN
    IF p_election_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '선거 ID가 올바르지 않습니다.');
    END IF;

    -- 동일 선거에 대한 기표/수정 경합 직렬화(cast_registered_vote 계열과 동일 키).
    PERFORM pg_advisory_xact_lock(hashtextextended(p_election_id::TEXT, 0));

    SELECT * INTO v_election FROM elections WHERE id = p_election_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    END IF;

    -- 연동 선거만(openvote 자체 선거 보호).
    IF v_election.nozolink_union_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_integration_election', 'message', '이 선거는 연동 선거가 아닙니다.');
    END IF;

    -- 투표수 가드: 1표라도 있으면 수정 금지.
    SELECT COUNT(*) INTO v_cast FROM ballots WHERE election_id = p_election_id;
    IF v_cast > 0 THEN
        RETURN json_build_object('success', false, 'error', 'has_votes', 'message', '이미 투표가 있어 수정할 수 없습니다.', 'cast_count', v_cast);
    END IF;

    IF p_candidates IS NOT NULL THEN
        IF jsonb_typeof(p_candidates) <> 'array' OR jsonb_array_length(p_candidates) = 0 THEN
            RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '최소 한 개 이상의 투표 항목이 필요합니다.');
        END IF;
    END IF;

    -- 제목 제공 시 비어 있으면 거부(기존값 유지가 아니라 명시적 오류).
    IF p_name IS NOT NULL AND trim(p_name) = '' THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '투표명을 입력해주세요.');
    END IF;

    -- 최종 시작/마감(미제공은 기존값)으로 순서 검증.
    v_new_starts := COALESCE(p_starts_at, v_election.starts_at);
    v_new_ends := COALESCE(p_ends_at, v_election.ends_at);
    IF v_new_starts IS NOT NULL AND v_new_ends IS NOT NULL AND v_new_ends <= v_new_starts THEN
        RETURN json_build_object('success', false, 'error', 'invalid_dates', 'message', '마감 일시는 시작 일시 이후여야 합니다.');
    END IF;

    UPDATE elections SET
        name        = COALESCE(NULLIF(trim(COALESCE(p_name, '')), ''), name),
        description = CASE WHEN p_description IS NULL THEN description ELSE NULLIF(trim(p_description), '') END,
        candidates  = COALESCE(p_candidates, candidates),
        starts_at   = v_new_starts,
        ends_at     = v_new_ends,
        updated_at  = NOW()
    WHERE id = p_election_id;

    SELECT COUNT(*) INTO v_voter_count FROM voter_registry WHERE election_id = p_election_id;

    INSERT INTO audit_logs (event_type, election_id, details)
    VALUES ('external_election_updated', p_election_id, jsonb_build_object(
        'union_id', v_election.nozolink_union_id,
        'changed', jsonb_build_object(
            'name', p_name IS NOT NULL,
            'description', p_description IS NOT NULL,
            'candidates', p_candidates IS NOT NULL,
            'starts_at', p_starts_at IS NOT NULL,
            'ends_at', p_ends_at IS NOT NULL
        )
    ));

    RETURN json_build_object(
        'success', true,
        'election_id', p_election_id,
        'voter_count', v_voter_count,
        'cast_count', 0
    );
END;
$$;

COMMENT ON FUNCTION update_integration_election(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ)
IS '연동 선거 수정(제목/설명/후보/일시). 투표수 0일 때만. 후보 교체 허용.';

-- -----------------------------------------------------
-- 2. RPC: delete_integration_election
--    0표 확인 → sms_token 선불 차감분을 조합 지갑으로 환불 → 감사 보존 → 하드 삭제.
--    전 과정을 하나의 트랜잭션(RPC)으로 원자 처리한다.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION delete_integration_election(
    p_election_id UUID,
    p_actor UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_election elections%ROWTYPE;
    v_cast INTEGER;
    v_voter_count INTEGER;
    v_refund INTEGER := 0;
    v_charge JSON;
BEGIN
    IF p_election_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'invalid_request', 'message', '선거 ID가 올바르지 않습니다.');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_election_id::TEXT, 0));

    SELECT * INTO v_election FROM elections WHERE id = p_election_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'election_not_found', 'message', '선거 정보를 찾을 수 없습니다.');
    END IF;

    IF v_election.nozolink_union_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_integration_election', 'message', '이 선거는 연동 선거가 아닙니다.');
    END IF;

    SELECT COUNT(*) INTO v_cast FROM ballots WHERE election_id = p_election_id;
    IF v_cast > 0 THEN
        RETURN json_build_object('success', false, 'error', 'has_votes', 'message', '이미 투표가 있어 삭제할 수 없습니다.', 'cast_count', v_cast);
    END IF;

    SELECT COUNT(*) INTO v_voter_count FROM voter_registry WHERE election_id = p_election_id;

    -- sms_token 선불 차감분 환불(양수 = 충전). member_session 은 billed_points = 0.
    IF v_election.auth_mode = 'sms_token' AND COALESCE(v_election.billed_points, 0) > 0 THEN
        v_charge := charge_union_points(
            v_election.nozolink_union_id,
            v_election.billed_points,
            'election_refund',
            p_actor,
            v_election.name,
            p_election_id
        );
        IF (v_charge ->> 'success')::BOOLEAN IS NOT TRUE THEN
            -- 환불 실패 시 전체 롤백(선거는 삭제되지 않음).
            RETURN v_charge;
        END IF;
        v_refund := v_election.billed_points;
    END IF;

    -- 감사 로그 보존: election_id FK(RESTRICT)를 끊고 삭제 이벤트를 남긴다.
    UPDATE audit_logs SET election_id = NULL WHERE election_id = p_election_id;
    INSERT INTO audit_logs (event_type, election_id, details)
    VALUES ('external_election_deleted', NULL, jsonb_build_object(
        'election_id', p_election_id,
        'union_id', v_election.nozolink_union_id,
        'auth_mode', v_election.auth_mode,
        'voter_count', v_voter_count,
        'refunded', v_refund,
        'actor', p_actor
    ));

    -- 하드 삭제: voter_registry/ballots/voter_codes 는 ON DELETE CASCADE,
    -- union_point_ledger.election_id 는 ON DELETE SET NULL(환불 원장은 union_id 로 보존).
    DELETE FROM elections WHERE id = p_election_id;

    RETURN json_build_object(
        'success', true,
        'refunded', v_refund,
        'voter_count', v_voter_count,
        'cast_count', 0
    );
END;
$$;

COMMENT ON FUNCTION delete_integration_election(UUID, UUID)
IS '연동 선거 삭제(투표수 0일 때만) + sms_token 선불 포인트 조합 지갑 환불(원자적).';

-- -----------------------------------------------------
-- 3. 권한
-- -----------------------------------------------------
GRANT EXECUTE ON FUNCTION update_integration_election(UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION delete_integration_election(UUID, UUID) TO service_role;
