-- =====================================================
-- 기존 함수 7종의 search_path 고정
-- =====================================================
-- Supabase 보안 어드바이저 `function_search_path_mutable` (WARN) 대응.
-- 이 7개는 2026-07-30 권한 락다운 이전부터 proconfig 가 비어 있어, 호출자의
-- search_path 를 그대로 물려받았다. 스키마가 뒤바뀌면 같은 이름의 다른 객체를
-- 집게 되므로 함수 정의에 고정한다.
--
-- 고정값을 `app_open_vote, extensions` 로 두는 이유(실측):
--   - 같은 스키마의 다른 14개 함수가 이미 이 값을 쓴다(규약 일치).
--   - 본문이 elections/ballots/voter_registry 등을 비한정으로 참조한다
--     → `''` 로 고정하면 전부 깨진다.
--   - digest()·gen_random_bytes()(pgcrypto)가 `extensions` 에 있고
--     create_election_with_billing / cast_member_vote / cast_link_vote 가 쓴다
--     → `extensions` 를 빼면 이 셋이 깨진다.
--   - encode()·hashtextextended() 는 pg_catalog 소속이며, pg_catalog 은 경로에
--     명시하지 않아도 항상 먼저 검색되므로 별도로 적지 않는다.
--   - 타 스키마(auth / public / app_nozolink / core) 참조는 7개 모두 0건이다.
--
-- 점검 함수 2종(permission_baseline_violations / assert_permission_baseline)만
-- `''` 를 쓴다. 그쪽은 카탈로그만 보고 스키마 객체를 전부 한정해 두었다.
--
-- ALTER FUNCTION ... SET 은 ACL 을 건드리지 않으므로 락다운 상태가 유지된다.
-- 그래도 마지막에 assert_permission_baseline() 으로 확인한다.
--
-- 모든 구문은 재실행 가능(idempotent)하다. 적용은 사람이 한다(자동 적용 금지).
-- =====================================================

ALTER FUNCTION app_open_vote.charge_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID)
    SET search_path = app_open_vote, extensions;

ALTER FUNCTION app_open_vote.charge_union_points(UUID, INTEGER, TEXT, UUID, TEXT, UUID)
    SET search_path = app_open_vote, extensions;

ALTER FUNCTION app_open_vote.create_election_with_billing(
        TEXT, TEXT, JSONB, TEXT, UUID, UUID, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER)
    SET search_path = app_open_vote, extensions;

ALTER FUNCTION app_open_vote.update_integration_election(
        UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ, TIMESTAMPTZ)
    SET search_path = app_open_vote, extensions;

ALTER FUNCTION app_open_vote.delete_integration_election(UUID, UUID)
    SET search_path = app_open_vote, extensions;

ALTER FUNCTION app_open_vote.cast_member_vote(UUID, UUID, TEXT, TEXT)
    SET search_path = app_open_vote, extensions;

-- 3인자 토큰 오버로드만 미고정이었다. 4인자(uuid,text,text,text)는 이미 고정돼 있다.
ALTER FUNCTION app_open_vote.cast_link_vote(TEXT, TEXT, TEXT)
    SET search_path = app_open_vote, extensions;

-- -----------------------------------------------------
-- 검증
-- -----------------------------------------------------
DO $$
DECLARE
    v_unpinned INTEGER;
    v_names TEXT;
BEGIN
    -- 음성: app_open_vote 의 모든 함수가 search_path 를 고정해야 한다.
    SELECT count(*), string_agg(p.oid::regprocedure::TEXT, ', ')
      INTO v_unpinned, v_names
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_open_vote'
      AND NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::TEXT[])) AS cfg
          WHERE cfg LIKE 'search_path=%'
      );

    IF v_unpinned > 0 THEN
        RAISE EXCEPTION 'search_path 미고정 함수 %건: %', v_unpinned, v_names;
    END IF;

    -- 양성: 고정한 경로에서 pgcrypto 함수가 실제로 해석되어야 한다.
    -- (extensions 를 빼먹으면 여기서 42883 으로 걸린다)
    PERFORM set_config('search_path', 'app_open_vote, extensions', true);
    PERFORM encode(digest('probe'::TEXT, 'sha256'), 'hex');
    PERFORM gen_random_bytes(4);
    PERFORM hashtextextended('probe'::TEXT, 0);

    -- 양성: 권한 기준선이 그대로여야 한다(ALTER FUNCTION 이 ACL 을 건드리지 않았는지).
    PERFORM app_open_vote.assert_permission_baseline();

    RAISE NOTICE 'search_path 고정 완료: app_open_vote 함수 21개 전부 고정, 기준선 유지';
END $$;
