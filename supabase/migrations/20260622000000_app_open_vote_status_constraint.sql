-- =====================================================
-- Open Vote: app_open_vote.elections.status CHECK 제약 보정 (멱등)
-- =====================================================
-- 배경: Supabase 프로젝트를 bluerdot 모노레포로 이전하면서 모든 테이블이
-- `public`이 아니라 `app_open_vote` 스키마에 위치하게 되었습니다
-- (라이브 DB에 적용된 마이그레이션: 20260621070439_app_open_vote_schema).
-- 따라서 `public.elections`를 대상으로 한 이전 스크립트는
-- "relation \"elections\" does not exist" 오류로 실패합니다.
--
-- 이 스크립트는 `app_open_vote.elections.status`가 4개 상태('draft','active',
-- 'paused','closed')를 허용하도록 보장합니다. 현재 라이브 DB에는 이미 올바른
-- 제약이 있으므로 사실상 멱등(no-op)이며, 적용 순서/존재 여부와 무관하게
-- 안전하도록 테이블 존재를 확인한 뒤에만 실행합니다.
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'app_open_vote'
          AND table_name = 'elections'
    ) THEN
        ALTER TABLE app_open_vote.elections
            DROP CONSTRAINT IF EXISTS elections_status_check;

        ALTER TABLE app_open_vote.elections
            ADD CONSTRAINT elections_status_check
            CHECK (status IN ('draft', 'active', 'paused', 'closed'));

        COMMENT ON COLUMN app_open_vote.elections.status IS
            'draft: 준비중, active: 진행중, paused: 일시중단, closed: 종료';
    END IF;
END $$;
