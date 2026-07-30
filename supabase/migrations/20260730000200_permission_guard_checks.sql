-- =====================================================
-- 권한 기준선 점검 함수 (재발 방지)
-- =====================================================
-- 노조링크·Cowork 가 쓰는 점검 함수 4종(쓰기 락다운 / 정책 없는 그랜트 /
-- 함수 ACL / 기본권한)을 OpenVote 쪽으로 받은 것. 세 앱이 같은 Supabase
-- 프로젝트를 공유하므로 점검 형태를 맞춘다.
--
-- 왜 필요한가: 함수의 PUBLIC EXECUTE 는 Postgres 하드와이어드 기본값이라
-- 스키마 단위 ALTER DEFAULT PRIVILEGES 로 지워지지 않는다(그 위에 더하기만 한다).
-- 전역 ADP 로는 지울 수 있지만 모든 스키마에 걸려 다른 앱을 깨뜨린다
-- (Cowork 의 cowork_guest 가 public 함수를 PUBLIC 경유로 실행한다).
-- 따라서 새 함수를 만들 때마다 마이그레이션에 명시적으로
--   REVOKE EXECUTE ON FUNCTION app_open_vote.f(...) FROM public, anon, authenticated;
-- 를 넣어야 하고, 그걸 잊는 것을 이 함수가 잡는다.
--
-- 사용법:
--   SELECT * FROM app_open_vote.permission_baseline_violations();  -- 위반 목록
--   SELECT app_open_vote.assert_permission_baseline();             -- 위반 시 예외
-- 마이그레이션 뒤, 그리고 CI/배포 점검에서 후자를 호출한다.
--
-- 설계 원칙: 기본 거부 + 허용목록 + 오버슛 단언 + 허용목록 개수 못 박기.
-- 마지막 항목이 핵심이다 — 허용목록을 늘리면 개수 단언이 깨져 "왜 늘리는지"를
-- 반드시 한 번 설명하게 만든다.
-- =====================================================

SET search_path = app_open_vote, public, extensions;

CREATE OR REPLACE FUNCTION app_open_vote.permission_baseline_violations()
RETURNS TABLE(check_name TEXT, object_name TEXT, detail TEXT)
LANGUAGE sql
STABLE
-- search_path 를 비운다(Supabase 어드바이저 function_search_path_mutable).
-- pg_catalog 은 명시하지 않아도 항상 먼저 검색되므로 pg_class·aclexplode·
-- has_table_privilege 등 카탈로그 참조는 그대로 해석된다. 스키마 객체는
-- app_open_vote.* 로 전부 한정해 두었다.
SET search_path = ''
AS $$
WITH
-- ── 허용목록: app_open_vote 에서 클라이언트 롤에 허용되는 유일한 권한 ──
-- ballots SELECT = /dashboard·/results 의 Realtime(postgres_changes) 원장 구독.
-- 여기에 줄을 추가하면 아래 '허용목록 개수' 검사가 깨진다. 의도된 장치다.
allowed(relname, privilege, grantee_label) AS (
    VALUES ('ballots', 'SELECT', 'anon'),
           ('ballots', 'SELECT', 'authenticated')
),
client_roles(role_name) AS (
    VALUES ('anon'), ('authenticated')
),
-- 클라이언트 롤 + PUBLIC. grantee 0 = PUBLIC 을 함께 봐야 PUBLIC 경유 우회를 잡는다.
client_grantees(grantee_oid, label) AS (
    SELECT 0::OID, 'PUBLIC'
    UNION ALL
    SELECT r.oid, r.rolname FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated')
),
-- 표·시퀀스에 클라이언트 롤/PUBLIC 으로 부여된 모든 권한.
-- 권한 이름 목록을 하드코딩하지 않고 ACL 을 직접 분해한다. 이유:
--   ⓐ PG17 이 MAINTAIN 을 추가했고 실제로 anon 이 그것을 갖고 있었다.
--      고정 목록은 새 권한이 생길 때 조용히 뒤처진다.
--   ⓑ 로컬(PG15)과 라이브(PG17)의 권한 이름이 달라
--      has_table_privilege(...,'MAINTAIN') 자체가 PG15 에서 에러가 된다.
-- relacl 이 NULL 이면 소유자 전용이므로 aclexplode 가 0행을 돌려준다(= 위반 없음).
client_rel_grants AS (
    SELECT c.relname, c.relkind, g.label AS grantee_label, acl.privilege_type
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN client_grantees g ON g.grantee_oid = acl.grantee
    WHERE n.nspname = 'app_open_vote'
      AND c.relkind IN ('r', 'S')
)

-- ① 쓰기/읽기 락다운: 허용목록 밖의 표 권한
SELECT '표 그랜트',
       'app_open_vote.' || cg.relname,
       format('%s 가 %s 보유', cg.grantee_label, cg.privilege_type)
FROM client_rel_grants cg
WHERE cg.relkind = 'r'
  AND NOT EXISTS (
      SELECT 1 FROM allowed a
      WHERE a.relname = cg.relname
        AND a.privilege = cg.privilege_type
        AND a.grantee_label = cg.grantee_label
  )

UNION ALL

-- ② 시퀀스 권한 (nextval 로 우회 삽입을 돕는 자리)
SELECT '시퀀스 그랜트',
       'app_open_vote.' || cg.relname,
       format('%s 가 %s 보유', cg.grantee_label, cg.privilege_type)
FROM client_rel_grants cg
WHERE cg.relkind = 'S'

UNION ALL

-- ③ 정책 없는 그랜트: 허용하는 정책이 없는데 권한이 있는 표
--    (①과 겹치지만 허용목록이 자라도 살아남는 스키마 독립 원칙이다)
SELECT '정책 없는 그랜트',
       'app_open_vote.' || cg.relname,
       format('%s 가 %s 보유, 정책 0개', cg.grantee_label, cg.privilege_type)
FROM client_rel_grants cg
WHERE cg.relkind = 'r'
  AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'app_open_vote' AND p.tablename = cg.relname
  )

UNION ALL

-- ④ RLS 미적용 표 (그랜트가 하나라도 붙으면 정책 없이 그대로 열린다)
SELECT 'RLS 미적용',
       'app_open_vote.' || c.relname,
       'relrowsecurity = false'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'app_open_vote'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity

UNION ALL

-- ⑤ 함수 ACL: anon/authenticated EXECUTE (PUBLIC 상속분도 함께 잡힌다)
SELECT '함수 ACL',
       p.oid::regprocedure::TEXT,
       format('%s 가 EXECUTE 보유%s', r.role_name,
              CASE WHEN p.prosecdef THEN ' (SECURITY DEFINER!)' ELSE '' END)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN client_roles r
WHERE n.nspname = 'app_open_vote'
  AND has_function_privilege(r.role_name, p.oid, 'EXECUTE')

UNION ALL

-- ⑥ 함수 ACL(PUBLIC): 명시적 REVOKE ... FROM public 을 잊은 자리
--    proacl IS NULL = 기본값 그대로 = PUBLIC EXECUTE 보유
SELECT '함수 ACL(PUBLIC)',
       p.oid::regprocedure::TEXT,
       'PUBLIC EXECUTE — 마이그레이션에 REVOKE ... FROM public 누락'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app_open_vote'
  AND (
      p.proacl IS NULL
      OR EXISTS (
          SELECT 1 FROM aclexplode(p.proacl) a
          WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
  )

UNION ALL

-- ⑦ 기본권한(스키마 단위): 새 객체에 자동 부여가 되살아났는지
SELECT '기본권한',
       format('app_open_vote / %s', d.defaclobjtype),
       format('%s 에 %s 자동부여', a.grantee::regrole::TEXT, a.privilege_type)
FROM pg_default_acl d, aclexplode(d.defaclacl) a
WHERE d.defaclnamespace = 'app_open_vote'::regnamespace
  AND a.grantee::regrole::TEXT IN ('anon', 'authenticated')

UNION ALL

-- ⑧ 전역 기본권한: 노조링크·Cowork 와 공유하는 자원.
--    "스키마 단위 ADP 는 각자 자유, 전역 ADP 는 3앱 합의 후"가 합의사항이다.
--    합의 없이 전역 항목이 생기면 세 앱 중 하나가 조용히 멈춘다.
SELECT '전역 기본권한',
       format('(전역) / %s', d.defaclobjtype),
       format('%s 에 %s — 3앱 합의 필요', a.grantee::regrole::TEXT, a.privilege_type)
FROM pg_default_acl d, aclexplode(d.defaclacl) a
WHERE d.defaclnamespace = 0

UNION ALL

-- ⑨ 오버슛(양성 시험): 회수 후에도 살아 있어야 하는 것.
--    회수는 과하게 하기 쉽고, 그 결과는 조용한 0행이 아니라 42501 하드 에러다.
SELECT '과회수',
       'app_open_vote.ballots',
       format('%s 의 SELECT 가 없음 — /dashboard·/results 실시간 갱신 중단', r.role_name)
FROM client_roles r
WHERE NOT has_table_privilege(r.role_name, 'app_open_vote.ballots', 'SELECT')

UNION ALL

-- ⑩ 허용목록 개수 못 박기: 목록이 자라면 반드시 눈에 띄게 한다
--    기대값 2건 = ballots SELECT × (anon, authenticated)
SELECT '허용목록 개수',
       'allowed',
       format('허용목록이 %s건 — 기대값 2건. 늘렸다면 이 단언도 함께 고쳐야 한다',
              (SELECT count(*) FROM allowed))
WHERE (SELECT count(*) FROM allowed) <> 2
$$;

COMMENT ON FUNCTION app_open_vote.permission_baseline_violations()
IS 'app_open_vote 권한 기준선 위반 목록. 기본 거부 + 허용목록(ballots SELECT) + 오버슛/개수 단언.';

CREATE OR REPLACE FUNCTION app_open_vote.assert_permission_baseline()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
    v_first TEXT;
BEGIN
    SELECT count(*),
           min(format('[%s] %s — %s', check_name, object_name, detail))
      INTO v_count, v_first
      FROM app_open_vote.permission_baseline_violations();

    IF v_count > 0 THEN
        RAISE EXCEPTION '권한 기준선 위반 %건. 첫 항목: %', v_count, v_first
            USING HINT = 'SELECT * FROM app_open_vote.permission_baseline_violations(); 로 전체를 확인하세요';
    END IF;

    RETURN 'ok: app_open_vote 권한 기준선 위반 없음';
END $$;

COMMENT ON FUNCTION app_open_vote.assert_permission_baseline()
IS '권한 기준선 위반이 있으면 예외. 마이그레이션 직후와 CI/배포 점검에서 호출한다.';

-- -----------------------------------------------------
-- 권한: 이 함수들 자신에게도 같은 규칙을 적용한다
-- -----------------------------------------------------
-- 방금 만든 함수도 하드와이어드 기본값으로 PUBLIC EXECUTE 를 받는다.
-- (20260730000000 의 ADP 회수는 anon/authenticated 만 막고 PUBLIC 은 못 막는다.)
-- 점검 함수가 스스로 잡아낼 첫 위반이 되지 않도록 여기서 명시적으로 회수한다.
REVOKE EXECUTE ON FUNCTION app_open_vote.permission_baseline_violations()
    FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION app_open_vote.assert_permission_baseline()
    FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION app_open_vote.permission_baseline_violations() TO service_role;
GRANT EXECUTE ON FUNCTION app_open_vote.assert_permission_baseline() TO service_role;

-- 기준선 확인
DO $$
BEGIN
    PERFORM app_open_vote.assert_permission_baseline();
    RAISE NOTICE '권한 기준선 점검 통과';
END $$;
