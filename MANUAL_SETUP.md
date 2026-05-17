# Open Vote - 수동 서버 설정 가이드

Supabase CLI 설치가 실패했기 때문에, Supabase 대시보드를 사용하여 수동으로 서버 설정을 완료해야 합니다.

## 1. Supabase 대시보드에서 데이터베이스 스키마 설정

1. [Supabase 대시보드](https://app.supabase.com)에 접속합니다.
2. 프로젝트 `zxrwlwhbcivwpvmktuoj`를 선택합니다.
3. 왼쪽 메뉴에서 **SQL Editor**를 클릭합니다.
4. **New Query**를 클릭합니다.
5. `supabase/migrations/003_complete_schema.sql` 파일의 내용을 복사하여 쿼리 창에 붙여넣습니다.
6. **RUN** 버튼을 클릭합니다.

## 2. Supabase 대시보드에서 Edge Functions 설정

### 2.1 cast_vote 함수 생성
1. 대시보드에서 **Functions** 메뉴를 클릭합니다.
2. **+ New Function** 버튼을 클릭합니다.
3. 함수 이름을 `cast_vote`로 입력합니다.
4. 함수 코드 영역에 `supabase/edge-functions/cast_vote/index.ts` 파일의 내용을 붙여넣습니다.
5. **Create** 버튼을 클릭합니다.

### 2.2 generate_voter_codes 함수 생성
1. 다시 **+ New Function** 버튼을 클릭합니다.
2. 함수 이름을 `generate_voter_codes`로 입력합니다.
3. 함수 코드 영역에 `supabase/edge-functions/generate_voter_codes/index.ts` 파일의 내용을 붙여넣습니다.
4. **Create** 버튼을 클릭합니다.

### 2.3 함수 환경 변수 설정
1. 방금 생성한 함수들 중 하나를 클릭합니다.
2. **Environment Variables** 섹션에서 다음 변수들을 설정합니다:
   - `SUPABASE_URL`: https://zxrwlwhbcivwpvmktuoj.supabase.co
   - `SUPABASE_SERVICE_ROLE_KEY`: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cndsd2hiY2l2d3B2bWt0dW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODE0Mjg5OSwiZXhwIjoyMDkzNzE4ODk5fQ.KuOpTaLcQFHZLzmSPo7Jwg6ZV5f7y4tlJXsJDDRYMEM

## 3. RLS (Row Level Security) 설정 확인

1. 대시보드에서 **Table Editor** 메뉴를 클릭합니다.
2. 각 테이블의 설정을 확인하여 RLS가 활성화되어 있는지 확인합니다:
   - elections
   - voter_codes
   - ballots
   - rate_limits
   - audit_logs

## 4. 테스트

1. `.\run-app.ps1` 스크립트를 실행하여 애플리케이션이 제대로 연결되는지 확인합니다.
2. 관리자 페이지에서 테스트 투표를 생성해 봅니다.
3. 유권자 인증 및 투표 기능을 테스트합니다.

## 5. 문제 해결

### 함수가 작동하지 않는 경우
- 함수 이름이 정확히 `cast_vote` 및 `generate_voter_codes`인지 확인하세요.
- 함수 코드가 정확히 복사되었는지 확인하세요.
- 환경 변수가 올바르게 설정되었는지 확인하세요.

### 데이터베이스 연결 오류
- 스키마가 정확히 실행되었는지 확인하세요.
- 테이블 이름과 구조가 올바른지 확인하세요.