-- =====================================================
-- 레거시 익명투표 RPC 2종 제거
-- =====================================================
-- 20260730000000 에서 EXECUTE 를 회수했지만, 함수가 남아 있으면 "언젠가 누가
-- 다시 그랜트를 준다"가 남는다. 특히 generate_voter_codes_batch 는
-- SECURITY DEFINER(RLS 우회)에 권한 검사가 한 줄도 없고, 호출자가 지정한 아무
-- p_election_id 에 대해 유효한 인증코드를 만들어 응답으로 돌려준다.
-- 살려 둘 이유가 없으므로 지운다.
--
-- 제거 근거(실측):
--   - 앱 호출자 0. src/ 전체에서 이 두 RPC 를 부르는 코드가 없다
--     (database.types.ts 의 타입 선언만 남아 있다).
--   - 유일한 호출자였던 supabase/functions/{generate_voter_codes,cast_vote}
--     엣지 함수는 ⓐ 서비스롤 키를 쓰고 ⓑ 이 프로젝트에 배포되어 있지 않다
--     (라이브 엣지 함수는 Cowork 의 cw-* 5개뿐).
--   - 다른 함수 본문에서 참조 0, 트리거 참조 0.
--   - 설계상 대체됨: voter_codes(코드+전화뒷자리) 기반 익명투표는
--     voter_registry 기반 member_session / registered / sms_token 으로 넘어갔다.
--     현행 기표 경로는 cast_member_vote · cast_registered_vote · cast_link_vote 다.
--
-- voter_codes 표는 남긴다: get_election_stats 가 여전히 읽는다(레거시 선거 통계).
--   표 자체의 폐기는 별건으로 판단한다.
--
-- CASCADE 를 쓰지 않는다. 예상 못 한 의존성이 있으면 조용히 같이 지워지는 대신
-- 크게 실패해야 한다.
--
-- 되돌리려면 supabase/migrations/003_complete_schema.sql 의 정의를 참조하되,
-- 그때는 소유자 검사(auth.uid() = elections.created_by)를 반드시 넣고
-- service_role 에만 GRANT 해야 한다.
-- =====================================================

SET search_path = app_open_vote, public, extensions;

-- 인증코드 일괄 발급: SECURITY DEFINER + 권한검사 0 + 발급된 코드를 응답으로 반환
DROP FUNCTION IF EXISTS app_open_vote.generate_voter_codes_batch(UUID, INTEGER, TEXT[]);

-- 코드+전화뒷자리 익명 기표: 위 함수로 만든 코드를 그대로 통과시킨다
-- (voter_codes 를 진짜 유권자 명부와 대조하는 단계가 없었다)
DROP FUNCTION IF EXISTS app_open_vote.cast_anonymous_vote(UUID, TEXT, TEXT, TEXT);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app_open_vote'
          AND p.proname IN ('generate_voter_codes_batch', 'cast_anonymous_vote')
    ) THEN
        RAISE EXCEPTION '레거시 익명투표 RPC 가 아직 남아 있습니다';
    END IF;

    -- voter_codes 표는 get_election_stats 의존성 때문에 남아 있어야 한다
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app_open_vote' AND c.relname = 'voter_codes'
    ) THEN
        RAISE EXCEPTION 'voter_codes 표가 사라졌습니다 (get_election_stats 가 읽습니다)';
    END IF;

    RAISE NOTICE '레거시 익명투표 RPC 2종 제거 완료 (voter_codes 표는 유지)';
END $$;
