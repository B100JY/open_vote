# Open Vote - Supabase 설정 가이드

이 문서는 Open Vote 시스템을 Supabase 에 설정하고 배포하는 방법을 안내합니다.

## 목차

1. [Supabase 프로젝트 설정](#1-supabase-프로젝트-설정)
2. [데이터베이스 스키마 마이그레이션](#2-데이터베이스-스키마-마이그레이션)
3. [Edge Functions 배포](#3-edge-functions-배포)
4. [환경 변수 설정](#4-환경-변수-설정)
5. [Flutter 앱 설정](#5-flutter-앱-설정)
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

### 3.1 Supabase CLI 설치

```bash
# npm 사용 시
npm install -g supabase

# 또는 yarn 사용 시
yarn global add supabase
```

### 3.2 로그인 및 링크

```bash
# Supabase 로그인
supabase login

# 프로젝트 링크 (프로젝트 ID 는 URL 에서 확인: https://app.supabase.com/project/{PROJECT_ID})
supabase link --project-ref YOUR_PROJECT_REF
```

### 3.3 Edge Functions 배포

```bash
# cast_vote 함수 배포
supabase functions deploy cast_vote

# generate_voter_codes 함수 배포
supabase functions deploy generate_voter_codes
```

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

### 4.1 Flutter 앱 환경 변수

Flutter 앱은 컴파일 시점 환경 변수를 사용합니다:

```bash
# 개발 환경
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY

# 프로덕션 빌드 (Web)
flutter build web \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

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

## 5. Flutter 앱 설정

### 5.1 의존성 설치

```bash
cd F:/src/codeb/bluerdot/open_vote
flutter pub get
```

### 5.2 개발 서버 실행

```bash
# Web 으로 실행
flutter run -d chrome

# 또는 환경 변수와 함께 실행
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 5.3 프로덕션 빌드

```bash
# Web 프로덕션 빌드
flutter build web --release \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY

# 빌드 결과물은 build/web/ 디렉토리에 생성됨
```

---

## 6. 테스트 및 검증

### 6.1 투표 생성 테스트 (관리자)

1. Flutter 앱 실행
2. "관리자" 버튼 클릭
3. 투표 정보 입력:
   - 투표명: "테스트 선거"
   - 유권자 수: 10
   - 후보자: "후보 1", "후보 2" 추가
4. "투표 생성 및 인증코드 발급" 클릭
5. 생성된 인증코드 CSV 다운로드

### 6.2 투표 테스트 (유권자)

1. Flutter 앱 홈으로 이동
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
- [Flutter Web 배포](https://docs.flutter.dev/deployment/web)

---

**문의사항**: GitHub Issues 에서 질문해주세요.
