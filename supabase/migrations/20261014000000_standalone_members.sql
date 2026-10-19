-- OpenVote 서비스 전용 가입/권한 데이터. 운영 적용 전 별도 승인 필수.
-- 기존 auth.users 는 삭제/수정하지 않고 OpenVote 전용 합성 이메일 계정을 연결한다.
CREATE TABLE IF NOT EXISTS app_open_vote.members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    email text NOT NULL,
    display_name text NOT NULL,
    role text NOT NULL DEFAULT 'pending' CHECK (role IN ('pending', 'creator', 'admin', 'suspended')),
    email_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT open_vote_members_email_normalized CHECK (email = lower(btrim(email))),
    CONSTRAINT open_vote_members_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS open_vote_members_role_idx ON app_open_vote.members (role);
ALTER TABLE app_open_vote.members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_open_vote.members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE app_open_vote.members TO service_role;

-- 웹 회원가입 남용 방지를 위한 서버 전용 기록. 보존기한 정리 작업은 별도 배치.
CREATE TABLE IF NOT EXISTS app_open_vote.signup_attempts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email_hash text NOT NULL,
    ip_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_vote_signup_by_email ON app_open_vote.signup_attempts(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS open_vote_signup_by_ip ON app_open_vote.signup_attempts(ip_hash, created_at DESC);
ALTER TABLE app_open_vote.signup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_open_vote.signup_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE app_open_vote.signup_attempts TO service_role;

-- 동시 회원가입 요청도 인스턴스별 메모리 제한 없이 직렬화해 카운트.
CREATE OR REPLACE FUNCTION app_open_vote.claim_signup_attempt(p_email_hash text, p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app_open_vote, extensions
AS $$
DECLARE
  email_count integer;
  ip_count integer;
BEGIN
  IF p_email_hash !~ '^[a-f0-9]{64}$' OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid signup counter';
  END IF;

  -- IP 하나에 연속 가입이 걸려도 같은 시간창에서 정확하게 차단한다.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_hash, 1));

  SELECT count(*) INTO email_count FROM signup_attempts
    WHERE email_hash = p_email_hash AND created_at >= now() - interval '24 hours';
  SELECT count(*) INTO ip_count FROM signup_attempts
    WHERE ip_hash = p_ip_hash AND created_at >= now() - interval '1 hour';
  IF email_count >= 3 OR ip_count >= 10 THEN
    RETURN false;
  END IF;
  INSERT INTO signup_attempts(email_hash, ip_hash) VALUES (p_email_hash, p_ip_hash);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION app_open_vote.claim_signup_attempt(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_open_vote.claim_signup_attempt(text, text) TO service_role;


-- 로그인 요청은 Supabase 인증 서버 접근 전에 DB 전역에서 횟수를 제한한다.
CREATE TABLE IF NOT EXISTS app_open_vote.login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_vote_login_by_email ON app_open_vote.login_attempts(email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS open_vote_login_by_ip ON app_open_vote.login_attempts(ip_hash, created_at DESC);
ALTER TABLE app_open_vote.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_open_vote.login_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE app_open_vote.login_attempts TO service_role;

CREATE OR REPLACE FUNCTION app_open_vote.claim_login_attempt(p_email_hash text, p_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = app_open_vote, extensions
AS $$
DECLARE
  email_count integer;
  ip_count integer;
BEGIN
  IF p_email_hash !~ '^[a-f0-9]{64}$' OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid login counter';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_hash, 1));
  SELECT count(*) INTO email_count FROM login_attempts
    WHERE email_hash = p_email_hash AND created_at >= now() - interval '15 minutes';
  SELECT count(*) INTO ip_count FROM login_attempts
    WHERE ip_hash = p_ip_hash AND created_at >= now() - interval '15 minutes';
  IF email_count >= 10 OR ip_count >= 30 THEN
    RETURN false;
  END IF;
  INSERT INTO login_attempts(email_hash, ip_hash) VALUES (p_email_hash, p_ip_hash);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION app_open_vote.claim_login_attempt(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_open_vote.claim_login_attempt(text, text) TO service_role;

-- 최초 관리자 지정은 승인된 수동 절차로 별도 수행한다.
SELECT app_open_vote.assert_permission_baseline();
