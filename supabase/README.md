# Open Vote - Supabase 설정 가이드

이 문서는 Open Vote 시스템을 Supabase 에 설정하고 배포하는 방법을 안내합니다.

> **중요 (현행 배포 기준 — 2026-06 bluerdot 이전 후)**
>
> - **현행 라이브 DB는 모든 테이블/함수를 `public`이 아니라 `app_open_vote` 스키마에 둡니다.** Supabase 프로젝트가 bluerdot 모노레포로 이전되면서 스키마가 분리되었고(`core`, `app_open_vote`, `app_nozolink` 등 단일 DB 공유), 앱 코드도 `db: { schema: "app_open_vote" }`로 라우팅합니다([src/lib/supabase/server.ts](../src/lib/supabase/server.ts)).
> - **이 스키마는 모노레포의 마이그레이션이 소유합니다.** 라이브 DB에 적용된 마이그레이션은 `20260621070259_core_schema`, `20260621070439_app_open_vote_schema` 둘뿐이며, `app_open_vote` 스키마(테이블·체인 컬럼·RPC·`elections.status`의 4개 상태 제약 포함)가 이미 완비되어 있습니다.
> - ⚠️ **이 리포의 `public` 대상 마이그레이션은 레거시입니다.** `001_initial_schema.sql` · `002_functions.sql` · `003_complete_schema.sql` · `20260518*.sql` · `setup.sql` · `setup.combined.sql`은 독립형(standalone) `public` 스키마 배포 시절의 산물로, **현행 DB에 실행하면 `relation "elections" does not exist`로 실패**합니다. 실행하지 마세요(과거 기록 보관용).
> - 현행 DB에 안전하게 실행 가능한 스크립트는 다음 두 개뿐이며 모두 멱등입니다(이미 충족 시 no-op).
>   1. [20260622000000_app_open_vote_status_constraint.sql](migrations/20260622000000_app_open_vote_status_constraint.sql) — `app_open_vote.elections.status`의 `paused` 허용 보장
>   2. [20260705000001_app_open_vote_sms_billing.sql](migrations/20260705000001_app_open_vote_sms_billing.sql) — **SMS 투표 링크 + 포인트 과금 모델**: `voter_registry`에 `phone`/`voter_name`/`access_token_hash` 추가(이메일 또는 전화 필수로 완화), `credit_accounts`/`credit_transactions`/`api_clients` 테이블, `create_billed_election`/`cast_link_vote`/`adjust_credits`/`rotate_voter_tokens`/`find_user_id_by_email` RPC
> - 아래 3장(Edge Functions 배포) · 5장(Flutter 앱 설정) 및 `voter_codes`(6자리 코드 + 전화번호 뒷자리) 안내는 **레거시**입니다. 현행 웹앱은 **문자(SMS) 투표 링크 토큰 + `voter_registry`** 모델(이메일 매직 링크 병행)을 사용합니다.
> - **2026-07-30 제거분**: Flutter 소스(`lib/`)·`pubspec.*`·`run-app.ps1`·`build-web.ps1`, 엣지 함수 `cast_vote`/`generate_voter_codes`(배포된 적 없음), RPC `cast_anonymous_vote`/`generate_voter_codes_batch`. 배포할 엣지 함수는 이제 없고, 기표·발급·과금은 Next.js API 라우트가 서비스롤로 처리합니다.
> - 🔒 **권한 기준선(2026-07-30)**: `app_open_vote` 에서 `anon`·`authenticated` 가 갖는 권한은 **`ballots` 의 SELECT 하나뿐**입니다. 새 테이블·함수를 추가할 때 클라이언트 롤에 그랜트를 주지 마시고, **새 함수마다** `REVOKE EXECUTE ON FUNCTION ... FROM public, anon, authenticated;` 와 `SET search_path` 를 넣으십시오(함수의 PUBLIC EXECUTE 는 `ALTER DEFAULT PRIVILEGES` 로 막히지 않습니다). 확인: `select app_open_vote.assert_permission_baseline();`
> - **권한 롤**: 투표 생성 API는 로그인 사용자의 **`app_metadata.role`** 클레임으로만 인가됩니다.
>   `admin`은 모든 선거 관리 + 포인트 지급 + API 키 발급, `creator`는 자신이 만든 선거만 관리합니다. 부여 예시:
>   ```sql
>   -- 특정 사용자를 관리자로 지정 (service_role 권한으로 실행)
>   UPDATE auth.users
>   SET raw_app_meta_data =
>       coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
>   WHERE email = 'admin@example.com';
>
>   -- 투표 생성 권한만 부여 (자기 선거만 관리)
>   UPDATE auth.users
>   SET raw_app_meta_data =
>       coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"creator"}'::jsonb
>   WHERE email = 'creator@example.com';
>   ```
>   `app_metadata`는 사용자가 클라이언트에서 수정할 수 없어 권한 상승을 막습니다. `user_metadata`는 사용하지 마세요.

## 목차

1. [Supabase 프로젝트 설정](#1-supabase-프로젝트-설정)
2. [데이터베이스 스키마 마이그레이션](#2-데이터베이스-스키마-마이그레이션)
3. [Edge Functions 배포](#3-edge-functions-배포) — 레거시(배포 대상 없음)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [웹앱 실행](#5-웹앱-실행)
6. [테스트 및 검증](#6-테스트-및-검증)

---

## 1. Supabase 프로젝트 설정

### 1.1 Supabase 프로젝트 생성

1. [Supabase](https://supabase.com) 에 로그인합니다
2. "New Project" 버튼을 클릭합니다
3. 프로젝트 정보 입력:
   - **Name**: `open-vote` (또는 원하는 이름)
   - **Database Password**: 안전한 비밀번호 저장 (나중에 필요함)
   - **Region**: 한국에서 가까운 지역 선택 (권장: `ap-northeast-1` 도쿄)

### 1.2 API 키 확인

프로젝트 대시보드에서 다음 키를 확인합니다:

1. **Settings** → **API** 이동
2. 다음 키를 메모해 둡니다:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbG...` (클라이언트용)
   - **service_role key**: `eyJhbG...` (서버/Edge Function 용 - **비밀 유지**)

---

## 2. 데이터베이스 스키마 마이그레이션

### 2.1 SQL Editor 에서 실행

1. Supabase 대시보드에서 **SQL Editor** → **New Query** 클릭
2. `supabase/migrations/003_complete_schema.sql` 파일 내용을 복사하여 붙여넣기
3. **Run** 버튼 클릭

### 2.2 마이그레이션 검증

다음 쿼리를 실행하여 테이블이 생성되었는지 확인합니다:

```sql
-- 테이블 목록 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- 결과에 다음 테이블이 표시되어야 함:
-- elections, voter_codes, ballots, rate_limits, audit_logs
```

### 2.3 함수 검증

```sql
-- 함수 목록 확인
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- 결과에 다음 함수가 표시되어야 함:
-- cast_anonymous_vote, generate_voter_codes_batch, get_election_stats, get_vote_results
```

---

## 3. Edge Functions 배포

⚠️ **레거시 — 배포할 엣지 함수가 없습니다.**

`cast_vote` · `generate_voter_codes` 는 이 프로젝트에 배포된 적이 없고
2026-07-30 에 소스까지 제거했습니다. 호출 대상이던
`cast_anonymous_vote` · `generate_voter_codes_batch` RPC 도 함께 삭제했습니다
(`voter_registry` 기반 기표 경로로 대체됨).

현행 기표·발급·과금은 모두 Next.js API 라우트(`src/app/api/**`)가
서비스롤로 처리합니다. Supabase CLI 는 스키마 작업이 필요할 때만 쓰십시오.

### 3.4 Edge Functions 환경 변수 설정

```bash
# cast_vote 환경 변수 설정
supabase secrets set SUPABASE_URL=YOUR_SUPABASE_URL
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

### 3.5 함수 테스트

```bash
# cast_vote 함수 로컬 테스트 (옵션)
supabase functions serve cast_vote

# 다른 터미널에서 테스트 요청
curl -X POST http://localhost:54321/functions/v1/cast_vote \
  -H "Content-Type: application/json" \
  -d '{"election_id":"...", "code":"123456", "phone_suffix":"1234", "selected_candidate":"candidate_1"}'
```

---

## 4. 환경 변수 설정

### 4.1 웹앱 환경 변수

`.env.local`(로컬) 또는 호스팅 프로젝트 설정(프로덕션)에서 런타임에 읽습니다.
전체 목록과 설명은 `.env.example` 에 있습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

⚠️ `NEXT_PUBLIC_*` 은 브라우저 번들에 포함됩니다. 서버 전용 키
(`SUPABASE_SERVICE_ROLE_KEY`, `OPENVOTE_API_KEY`, `SIMPLY_NOTIFIER_*`)에는
이 접두사를 붙이지 마십시오.

공개키가 노출돼도 안전한 이유는 위 권한 기준선입니다 — `anon` 은
`app_open_vote` 에서 `ballots` SELECT 외에 아무 권한이 없습니다.

### 4.2 .env 파일 생성 (선택사항)

로컬 개발 편의를 위해 `.env` 파일을 생성합니다:

```bash
# 프로젝트 루트에 .env 파일 생성
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

**주의**: `.env` 파일은 절대 Git 에 커밋하지 마세요! `.gitignore` 에 이미 추가되어 있습니다.

---

## 5. 웹앱 실행

### 5.1 의존성 설치

```bash
npm install
```

### 5.2 개발 서버 실행

```bash
npm run dev
```

`http://localhost:3100` 에서 열립니다. 환경 변수는 `.env.local` 에서 읽으며
(`--dart-define` 같은 컴파일 시점 주입이 아닙니다) 목록은 `.env.example` 에 있습니다.

### 5.3 프로덕션 빌드

```bash
npm run build
```

배포는 [DEPLOYMENT.md](../DEPLOYMENT.md) 를 참고하세요. 서버 라우트가 서비스롤을
쓰므로 정적 SPA 호스팅은 쓸 수 없고 Node 런타임이 필요합니다.

> Flutter 앱(`lib/`, `pubspec.yaml`)은 2026-07-30 에 제거했습니다.

---

## 6. 테스트 및 검증

⚠️ **6.1~6.2 는 레거시 절차입니다** — 삭제된 Flutter 앱과 `voter_codes`(6자리 코드 +
전화번호 뒷자리) 모델을 전제합니다. 현행 웹앱의 흐름은 문자 링크 토큰 +
`voter_registry` 이며 [README.md](../README.md) 의 "주요 흐름"을 참고하세요.
6.3(익명성 검증)은 현행에도 유효합니다.

### 6.1 투표 생성 테스트 (관리자, 레거시)

1. 웹앱 실행(`npm run dev`)
2. "관리자" 버튼 클릭
3. 투표 정보 입력:
   - 투표명: "테스트 선거"
   - 유권자 수: 10
   - 후보자: "후보 1", "후보 2" 추가
4. "투표 생성 및 인증코드 발급" 클릭
5. 생성된 인증코드 CSV 다운로드

### 6.2 투표 테스트 (유권자, 레거시)

1. 웹앱 홈으로 이동
2. "투표하기" 클릭
3. 테스트 선거 선택
4. 다운로드한 CSV 에서 인증코드와 전화번호 뒷자리 입력
5. 후보자 선택 후 투표
6. "투표 완료" 화면 확인

### 6.3 익명성 검증 (중요!)

다음 SQL 쿼리를 실행하여 **voter_codes 와 ballots 사이에 연결 고리가 없음**을 확인합니다:

```sql
-- voter_codes 와 ballots 의 FK 관계 확인 (없어야 함!)
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('voter_codes', 'ballots');

-- 결과: ballots.election_id 만 elections.id 를 참조해야 함
-- voter_codes 와 ballots 간의 FK 는 존재하지 않아야 함!
```

### 6.4 투표 진행률 확인

```sql
-- 선거 통계 확인
SELECT get_election_stats('YOUR_ELECTION_ID');

-- 결과 예시:
-- {
--   "election": {"id": "...", "name": "테스트 선거", "status": "active"},
--   "voter_codes": {"total": 10, "used": 3, "remaining": 7},
--   "ballots": {"total": 3},
--   "progress": 30.00
-- }
```

---

## 7. 문제 해결

### 7.1 "relation does not exist" 오류

**원인**: 데이터베이스 스키마가 생성되지 않음

**해결**:
```sql
-- 003_complete_schema.sql 다시 실행
```

### 7.2 "function does not exist" 오류

**원인**: 데이터베이스 함수가 생성되지 않음

**해결**:
```sql
-- 003_complete_schema.sql 다시 실행 (함수 포함)
```

### 7.3 Edge Function 401 오류

**원인**: service_role 키가 잘못됨

**해결**:
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=올바른_키
```

### 7.4 RLS policy 오류

**원인**: RLS 정책이 너무 엄격함

**해결**:
```sql
-- RLS 비활성화 (테스트용 - 프로덕션에서는 권장하지 않음)
ALTER TABLE elections DISABLE ROW LEVEL SECURITY;
ALTER TABLE voter_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE ballots DISABLE ROW LEVEL SECURITY;
```

---

## 8. 보안 체크리스트

- [ ] service_role 키가 Git 에 커밋되지 않았음
- [ ] voter_codes 테이블에 SELECT 권한이 제한됨
- [ ] ballots 테이블에 INSERT 가 Edge Function 으로만 제한됨
- [ ] rate_limits 테이블이 서비스 전용임
- [ ] HTTPS 만 사용함 (Supabase 는 기본 HTTPS)
- [ ] 인증코드가 CSV 로 안전하게 배포됨

---

## 9. 추가 리소스

- [Supabase 문서](https://supabase.com/docs)
- [Edge Functions 문서](https://supabase.com/docs/guides/functions)
- [RLS 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js 배포](https://nextjs.org/docs/app/building-your-application/deploying)
- [Postgres 권한/기본권한](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)

---

**문의사항**: GitHub Issues 에서 질문해주세요.
