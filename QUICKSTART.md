# Open Vote - 빠른 시작 가이드

## 🚀 자동 설정 (권장)

### 1 단계: 설정 스크립트 실행

```powershell
.\setup-supabase.ps1
```

이 스크립트가 다음을 자동으로 수행합니다:
- Supabase CLI 확인 및 로그인
- 프로젝트 링크
- Edge Functions 배포

### 2 단계: 데이터베이스 설정

1. Supabase 대시보드 열기: https://app.supabase.com/project/zxrwlwhbcivwpvmktuoj/sql/new
2. `supabase/setup.sql` 파일 내용을 복사하여 붙여넣기
3. **RUN** 버튼 클릭

### 3 단계: 환경 변수 설정

```powershell
# 터미널에서 실행
supabase secrets set SUPABASE_URL=https://zxrwlwhbcivwpvmktuoj.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cndsd2hiY2l2d3B2bWt0dW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE0Mjg5OSwiZXhwIjoyMDkzNzE4ODk5fQ.KuOpTaLcQFHZLzmSPo7Jwg6ZV5f7y4tlJXsJDDRYMEM
```

### 4 단계: 앱 실행

```powershell
.\run-app.ps1
```

---

## 📋 수동 설정

### 1. 데이터베이스 스키마 적용

1. https://app.supabase.com/project/zxrwlwhbcivwpvmktuoj/sql/new 접속
2. `supabase/setup.sql` 파일 내용 전체 복사
3. SQL Editor 에 붙여넣기 후 **RUN**

### 2. Edge Functions 배포

```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인
supabase login

# 프로젝트 링크
supabase link --project-ref zxrwlwhbcivwpvmktuoj

# 함수 배포
supabase functions deploy cast_vote
supabase functions deploy generate_voter_codes
```

### 3. 환경 변수 설정

Supabase 대시보드에서:
1. **Functions** → **cast_vote** 클릭
2. **Environment Variables** 에서 추가:
   - `SUPABASE_URL`: `https://zxrwlwhbcivwpvmktuoj.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (비밀 키)
3. **generate_voter_codes** 함수에도 동일하게 설정

---

## ✅ 설정 확인

### 데이터베이스 확인

```sql
-- 테이블 목록 조회
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- 결과: audit_logs, ballots, elections, rate_limits, voter_codes
```

### 함수 확인

```sql
-- 함수 목록 조회
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

-- 결과: cast_anonymous_vote, generate_voter_codes_batch, get_election_stats, get_vote_results, record_rate_limit_attempt
```

### Edge Function 확인

1. https://app.supabase.com/project/zxrwlwhbcivwpvmktuoj/functions 접속
2. `cast_vote`와 `generate_voter_codes` 함수가 있는지 확인
3. 상태가 **Active**인지 확인

---

## 🧪 테스트

### 1. 관리자 화면

1. 앱 실행: `.\run-app.ps1`
2. "관리자" 버튼 클릭
3. 투표 생성:
   - 투표명: `테스트 선거`
   - 유권자 수: `10`
   - 후보자: `후보 1`, `후보 2` 추가
4. "투표 생성 및 인증코드 발급" 클릭
5. CSV 다운로드

### 2. 유권자 투표

1. 홈으로 돌아가서 "투표하기" 클릭
2. "테스트 선거" 선택
3. CSV 에서 인증코드와 전화번호 뒷자리 입력
4. 후보자 선택 후 "투표하기" 클릭
5. "투표 완료" 화면 확인

### 3. 결과 확인

1. "대시보드"에서 실시간 진행률 확인
2. "결과"에서 득표 현황 확인

---

## 🔧 문제 해결

### "relation does not exist" 오류

→ `supabase/setup.sql` 을 실행하지 않았습니다. SQL Editor 에서 실행하세요.

### "function does not exist" 오류

→ 데이터베이스 함수가 생성되지 않았습니다. `setup.sql` 을 다시 실행하세요.

### Edge Function 401 오류

→ 환경 변수 `SUPABASE_SERVICE_ROLE_KEY` 가 잘못되었습니다. 다시 설정하세요.

### Rate Limit 오류

→ 테스트 중이라면 RLS 정책을 일시적으로 비활성화:

```sql
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
```

---

## 📞 도움이 필요하신가요?

- **이슈 제기**: https://github.com/your-org/open-vote/issues
- **문서**: README.md, DEPLOYMENT.md

---

**마지막 업데이트**: 2024-01-01
