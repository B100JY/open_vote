-- =====================================================
-- 과금 자산 FK 5개: ON DELETE CASCADE → RESTRICT
-- =====================================================
-- 배경: 이 Supabase 프로젝트(vvpmrzwjhzsjtieoweky)의 auth.users 를 노조링크·
--   OpenVote·Cowork 가 공유한다. 세 앱이 같은 service_role 키를 들고 있어
--   권한으로 나눌 수 없고, 2026-07-30 에 한 앱이 다른 앱 계정을 지우는 사고가
--   실제로 일어났다.
--
--   현재 app_open_vote 는 auth.users 를 참조하는 FK 11개를 갖고 있고,
--   그중 CASCADE 5개가 **전부 과금 자산**이다. 다른 앱이 auth 계정 하나를
--   지우면 OpenVote 의 돈·원장·API 키가 조용히 사라진다.
--
-- 조치: 그 5개를 RESTRICT 로 바꾼다. 삭제가 조용한 성공이 아니라
--   시끄러운 실패(foreign_key_violation, 23503)가 된다.
--
-- 왜 지금인가: 대상 5개 표가 **전부 0행**이다(2026-07-31 실측).
--   검증할 기존 행이 없고, 잠기는 계정이 없고, 롤백 위험이 없다.
--   행이 쌓이기 시작하면 이 비용은 돌아오지 않는다.
--
-- SET NULL 6개는 그대로 둔다:
--   elections.created_by · elections.billed_owner_user_id ·
--   point_ledger.created_by · union_point_ledger.created_by ·
--   voter_registry.user_id · voter_registry.auth_user_id
--   계정이 사라져도 선거·원장이 파괴되지 않으므로 보호 우선순위가 다르다.
--   특히 voter_registry 의 SET NULL 은 "삭제된 유권자의 등록 행이 익명 기록으로
--   남는다"는 의미를 갖고 있어, 바꾸면 선거 기록 보존 정책과 충돌한다.
--
-- ─────────────────────────────────────────────────────
-- ⚠️ 정당한 삭제 절차 (RESTRICT 적용 후)
-- ─────────────────────────────────────────────────────
-- 세 앱이 각자 자기 표에 RESTRICT 를 걸면 공유 계정은 서로를 잠근다.
-- 한 팀이 혼자 지울 수 없다. 이 절차를 모르면 첫 정당한 탈퇴 요청이 장애가 되고,
-- 어느 팀도 왜 삭제가 튕기는지 모른 채 디버깅을 시작한다.
--
--   OpenVote 몫 해제 순서:
--     ① api_clients                        (API 키)
--     ② credit_transactions · point_ledger (원장 — 보존 판단 필요)
--     ③ credit_accounts · point_wallets    (잔액)
--   그 다음 다른 앱이 각자 자기 행을 지우고, **마지막 팀이 auth.users 를 지운다.**
--   조율 담당은 3자 계약 문서에서 정한다. docs/shared-auth-openvote.md 참조.
--
-- OpenVote 에는 deleteUser 호출 경로가 없으므로(실측) 자기 흐름이 깨질 여지는 없다.
--
-- ⚠️ 검증에 실계정 DELETE 를 쓰지 말 것. 제약이 안 걸린 상태에서 그 DELETE 는
--    **성공**하고, 되돌리기 전에 세 앱을 CASCADE 로 훑는다. 검증 로직이 사고를
--    재현한다. 아래 DO 블록의 카탈로그 단언이면 충분하다(FK 의미는 Postgres 가 보장).
--
-- Postgres 는 ON DELETE 를 제자리 변경할 수 없으므로 drop + add 다.
-- 재실행 가능(idempotent): 이미 RESTRICT 면 drop 후 같은 정의로 다시 만든다.
-- 적용은 사람이 한다(자동 적용 금지).
-- =====================================================

SET search_path = app_open_vote, public, extensions;

ALTER TABLE app_open_vote.credit_accounts
    DROP CONSTRAINT IF EXISTS credit_accounts_user_id_fkey,
    ADD CONSTRAINT credit_accounts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE app_open_vote.credit_transactions
    DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey,
    ADD CONSTRAINT credit_transactions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE app_open_vote.point_wallets
    DROP CONSTRAINT IF EXISTS point_wallets_owner_user_id_fkey,
    ADD CONSTRAINT point_wallets_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE app_open_vote.point_ledger
    DROP CONSTRAINT IF EXISTS point_ledger_owner_user_id_fkey,
    ADD CONSTRAINT point_ledger_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE app_open_vote.api_clients
    DROP CONSTRAINT IF EXISTS api_clients_owner_user_id_fkey,
    ADD CONSTRAINT api_clients_owner_user_id_fkey
        FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- -----------------------------------------------------
-- 검증 — 카탈로그 단언 (DML 없음)
-- -----------------------------------------------------
DO $$
DECLARE
    v_restrict INTEGER;
    v_setnull  INTEGER;
    v_cascade  INTEGER;
    v_total    INTEGER;
    v_missing  TEXT;
BEGIN
    SELECT
        count(*) FILTER (WHERE c.confdeltype = 'r'),
        count(*) FILTER (WHERE c.confdeltype = 'n'),
        count(*) FILTER (WHERE c.confdeltype = 'c'),
        count(*)
      INTO v_restrict, v_setnull, v_cascade, v_total
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'app_open_vote'
      AND rn.nspname = 'auth'
      AND rt.relname = 'users';

    -- 음성: auth.users 로 향하는 CASCADE 가 하나도 없어야 한다.
    IF v_cascade > 0 THEN
        RAISE EXCEPTION 'auth.users CASCADE FK 가 %건 남았습니다 — 계정 삭제가 데이터를 파괴합니다', v_cascade;
    END IF;

    -- 다섯 개가 정확히 이름으로 RESTRICT 인지 확인(개수만 세면 엉뚱한 표가 바뀌어도 통과한다).
    SELECT string_agg(x.conname, ', ')
      INTO v_missing
    FROM (VALUES
        ('credit_accounts_user_id_fkey'),
        ('credit_transactions_user_id_fkey'),
        ('point_wallets_owner_user_id_fkey'),
        ('point_ledger_owner_user_id_fkey'),
        ('api_clients_owner_user_id_fkey')
    ) AS x(conname)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'app_open_vote'
          AND c.conname = x.conname
          AND c.confdeltype = 'r'
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'RESTRICT 적용 실패: %', v_missing;
    END IF;

    -- 양성(과적용 방지): SET NULL 6개가 그대로여야 한다.
    -- 여기까지 함께 바꾸면 선거 기록의 익명 보존 의미가 사라진다.
    IF v_setnull <> 6 THEN
        RAISE EXCEPTION 'SET NULL FK 가 6개가 아니라 %개입니다 — 과적용 여부를 확인하세요', v_setnull;
    END IF;

    IF v_restrict <> 5 OR v_total <> 11 THEN
        RAISE EXCEPTION 'FK 구성이 예상과 다릅니다: RESTRICT % / SET NULL % / 총 % (기대: 5 / 6 / 11)',
            v_restrict, v_setnull, v_total;
    END IF;

    RAISE NOTICE '과금 FK 5개 RESTRICT 적용 완료 (SET NULL 6개 유지, CASCADE 0)';
END $$;
