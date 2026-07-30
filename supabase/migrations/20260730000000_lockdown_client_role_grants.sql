-- =====================================================
-- app_open_vote 클라이언트 롤(anon/authenticated) 권한 락다운
-- =====================================================
-- 배경: 노조링크(app_nozolink) 권한 점검 보고서(2026-07-29).
--   공개키(publishable key)만으로 generate_voter_codes_batch → cast_anonymous_vote
--   를 연쇄 호출해 임의 선거에 표를 위조할 수 있는 상태였다.
--   원인은 함수 하나가 아니라 스키마 기본권한(pg_default_acl)이 새 객체마다
--   anon/authenticated 에 전권(arwdDxtm / EXECUTE)을 자동 부여해 온 것이다.
--   app_open_vote 는 PostgREST 노출 스키마(pgrst.db_schemas)이므로 HTTPS 로 도달한다.
--
-- 목표 상태(불변식):
--   app_open_vote 안에서 anon·authenticated 가 갖는 권한은 ballots 의 SELECT 하나뿐.
--   표 12개 0, 함수 21개 0, 시퀀스 0.
--
-- ballots SELECT 를 남기는 이유(= 양성 시험 대상, 과회수 금지):
--   /dashboard·/results 가 브라우저 공개키로 app_open_vote.ballots 에
--   Realtime(postgres_changes) 구독을 건다. Realtime 은 구독 롤의 테이블 권한과
--   RLS 로 인가하므로 이 그랜트가 사라지면 실시간 갱신이 멈춘다.
--   ballots 에는 투표자 식별 컬럼이 없어 공개 읽기가 익명성을 깨지 않는다.
--
-- 앱이 깨지지 않는 근거(코드 실측):
--   - API 라우트 전부 서비스롤(getServiceSupabase / getServiceDbSupabase)
--   - 브라우저 클라이언트(getBrowserSupabase)는 auth.* 와 위 Realtime 구독 전용.
--     .from() / .rpc() 호출이 없다.
--   - getAnonSupabase() 는 호출자 0 (별건 정리 대상)
--   - 노조링크 연동은 HTTP API(OPENVOTE_API_KEY) + 서비스롤만 사용 → 영향 없음
--
-- 실행 순서에 의미가 있다: ①기본권한을 먼저 닫아야 이후 만들어지는 객체가
-- 자동 부여를 받지 않는다. 그 다음 ②기존 객체의 현재 권한을 회수한다.
--
-- 모든 구문은 재실행 가능(idempotent)하다. 적용은 사람이 한다(자동 적용 금지).
-- =====================================================

SET search_path = app_open_vote, public, extensions;

-- -----------------------------------------------------
-- 1. 기본권한(pg_default_acl) — 재발 방지를 먼저
-- -----------------------------------------------------
-- 스키마 단위 ADP 만 건드린다. 전역(IN SCHEMA 없는) ADP 는 노조링크·Cowork 와
-- 공유하는 자원이라 3앱 합의 사항이며, 여기서 만지지 않는다.
-- 주의: 함수의 PUBLIC EXECUTE 는 Postgres 하드와이어드 기본값이라 ADP 로 지워지지
--       않는다. 새 함수를 만들 때마다 명시적 REVOKE 가 필요하다(20260730000200 참조).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_open_vote
    REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_open_vote
    REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_open_vote
    REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- -----------------------------------------------------
-- 2. 표·시퀀스 — 전부 회수 후 ballots SELECT 만 재부여
-- -----------------------------------------------------
-- 13개 표 전부가 anon/authenticated 에 8개 권한(arwdDxtm)을 갖고 있었다:
-- SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN.
-- TRUNCATE(D)와 MAINTAIN(m, PG17 신규 — VACUUM/ANALYZE/CLUSTER/REINDEX 등)은
-- RLS 가 적용되지 않는 권한이라 정책으로 막을 수 없었다. PostgREST 에 해당 동사가
-- 없어 HTTP 로 도달만 못 했을 뿐, 정책으로 못 막는 권한이 열려 있던 것은 사실이다.
REVOKE ALL ON ALL TABLES IN SCHEMA app_open_vote FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_open_vote FROM anon, authenticated;

-- 유일한 허용 항목. 늘리려면 20260730000200 의 허용목록 개수 단언도 함께 고쳐야 한다.
GRANT SELECT ON app_open_vote.ballots TO anon, authenticated;

-- 스키마 USAGE 는 유지한다. Realtime 이 ballots 를 해석하는 데 필요하다.

-- -----------------------------------------------------
-- 3. 함수 — 21개 전부 회수 (public 과 롤 이름을 함께)
-- -----------------------------------------------------
-- 브라우저가 부르는 RPC 는 하나도 없다. 익명/링크 투표까지 전부 서버 라우트가
-- 서비스롤로 호출한다. 'public' 을 함께 적지 않으면 하드와이어드 PUBLIC EXECUTE
-- 가 남아 anon 이 그대로 실행할 수 있다.
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA app_open_vote FROM public, anon, authenticated;

-- -----------------------------------------------------
-- 4. 정책 교정 — 심층방어
-- -----------------------------------------------------
-- 위 회수로 이 정책들은 사문이 된다. 그래도 고치는 이유: 이제 1차 방어선이
-- 그랜트이고 정책이 2차선이다. 훗날 누가 SELECT 하나를 되돌려도 무너지지 않아야 한다.
--
-- 이름은 creator_* / auth_* 인데 조건이 true 였다. 이 프로젝트에서 authenticated 는
-- "우리 사용자"가 아니라 auth.users 를 공유하는 세 앱(노조링크·OpenVote·Cowork)에
-- 구글로 가입한 아무나다.
--
-- (select auth.uid()) 로 감싸는 것은 행마다 재평가되지 않게 하기 위한 것이다.
-- 소유자 컬럼은 created_by 다(billed_owner_user_id 는 과금 주체로 별개).

-- 누구나 아무 선거를 수정 → 소유자만
ALTER POLICY elections_creator_update ON app_open_vote.elections
    USING (created_by = (SELECT auth.uid()));

-- 누구나 남의 이름으로 선거 생성 → 본인 명의만
ALTER POLICY elections_auth_insert ON app_open_vote.elections
    WITH CHECK (created_by = (SELECT auth.uid()));

-- 보고서 누락분: 누구나 draft 포함 모든 선거 조회 → 소유자만.
-- 공개 가시성(active/closed)은 elections_public_read({public})가 계속 담당한다.
ALTER POLICY elections_auth_read ON app_open_vote.elections
    USING (created_by = (SELECT auth.uid()));

-- 누구나 아무 선거에 인증코드 발급 → 경로 자체를 제거.
-- 코드 발급은 서비스롤 전용 관리자 행위다. 정책을 소유자 검사로 고치면 술어가
-- elections 를 참조해야 하고, 그러면 호출자에게 elections SELECT 권한이 필요해져
-- 정상 요청까지 42501 로 죽는 함정(보고서 §5)을 물려받는다. 그래서 교정이 아니라 삭제.
DROP POLICY IF EXISTS voter_codes_creator_insert ON app_open_vote.voter_codes;

-- -----------------------------------------------------
-- 5. 검증 — 목표 상태 단언
-- -----------------------------------------------------
-- 음성 시험(과소 회수)과 양성 시험(과회수) 양쪽을 본다.
--
-- 권한 이름 목록을 하드코딩하지 않고 ACL(relacl)을 직접 분해한다. 이유:
-- PG17 이 MAINTAIN 을 추가했고 실제로 anon 이 그것을 갖고 있었다. 고정 목록은
-- 새 권한이 생길 때 조용히 뒤처지고, 로컬(PG15)과 라이브(PG17)에서 이름이 달라
-- has_table_privilege(...,'MAINTAIN') 이 PG15 에서 에러가 된다.
-- ACL 분해는 서버가 아는 모든 권한 종류를 자동으로 잡고 버전에 무관하다.
-- grantee 0 = PUBLIC 도 함께 본다(PUBLIC 경유 우회 차단).
DO $$
DECLARE
    v_bad_tables INTEGER;
    v_bad_funcs INTEGER;
    v_bad_adp INTEGER;
BEGIN
    -- 음성: ballots SELECT(anon/authenticated) 를 뺀 모든 표·시퀀스 권한이 0이어야 한다.
    SELECT count(*) INTO v_bad_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    LEFT JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname = 'app_open_vote'
      AND c.relkind IN ('r', 'S')
      AND (acl.grantee = 0 OR r.rolname IN ('anon', 'authenticated'))
      AND NOT (c.relname = 'ballots'
               AND acl.privilege_type = 'SELECT'
               AND r.rolname IN ('anon', 'authenticated'));

    IF v_bad_tables > 0 THEN
        RAISE EXCEPTION '표/시퀀스 권한 회수 실패: 허용목록 밖 권한 %건이 남았습니다', v_bad_tables;
    END IF;

    -- 음성: 함수 EXECUTE 는 0이어야 한다(anon 검사는 PUBLIC 상속도 함께 잡는다).
    SELECT count(*) INTO v_bad_funcs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS role_name
    WHERE n.nspname = 'app_open_vote'
      AND has_function_privilege(role_name, p.oid, 'EXECUTE');

    IF v_bad_funcs > 0 THEN
        RAISE EXCEPTION '함수 EXECUTE 회수 실패: %건이 남았습니다', v_bad_funcs;
    END IF;

    -- 음성: 이 스키마 기본권한에 anon/authenticated 항목이 없어야 한다.
    SELECT count(*) INTO v_bad_adp
    FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace = 'app_open_vote'::regnamespace
      AND a.grantee::regrole::text IN ('anon', 'authenticated');

    IF v_bad_adp > 0 THEN
        RAISE EXCEPTION '기본권한 회수 실패: anon/authenticated 항목 %건이 남았습니다', v_bad_adp;
    END IF;

    -- 양성(과회수 방지): Realtime 원장 구독이 살아 있어야 한다.
    IF NOT has_table_privilege('anon', 'app_open_vote.ballots', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'app_open_vote.ballots', 'SELECT') THEN
        RAISE EXCEPTION '과회수: ballots SELECT 가 사라져 /dashboard·/results 실시간 갱신이 멈춥니다';
    END IF;

    RAISE NOTICE '권한 락다운 완료: 표 12개 0, 함수 21개 0, 시퀀스 0, ballots SELECT 유지';
END $$;
