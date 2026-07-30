# Open Vote - 실행 가이드

Open Vote 애플리케이션을 실행하기 위한 단계별 안내서입니다.

## 사전 요구 사항

- [Node.js](https://nodejs.org) 20 이상
- (선택) Supabase CLI — 스키마를 로컬에서 다룰 때만 필요

## 1. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com) 계정을 생성하고 새 프로젝트를 만듭니다.
2. 프로젝트 대시보드에서 다음 정보를 확인합니다:
   - **Project URL**: `https://xxxxx.supabase.co` 형식
   - **anon/public key**: Project Settings → API 메뉴에서 확인
   - **service_role key**: Project Settings → API 메뉴에서 확인 (비공개 키이므로 유출 주의!)

## 2. 데이터베이스 스키마 적용

1. Supabase 대시보드의 SQL Editor로 이동합니다.
2. `supabase/migrations/003_complete_schema.sql` 파일의 내용을 복사하여 쿼리 창에 붙여넣습니다.
3. RUN 버튼을 클릭하여 스키마를 적용합니다.

## 3. Edge Functions

배포할 엣지 함수가 없습니다. 기표·발급·과금은 모두 Next.js API 라우트가
서비스롤로 처리합니다(`src/app/api/**`).

레거시였던 `cast_vote` / `generate_voter_codes` 엣지 함수는 2026-07-30 에
제거했습니다. 배포된 적이 없었고, 호출 대상 RPC 도 `voter_registry` 기반
기표 경로로 대체된 상태였습니다.

## 4. 환경 변수 설정

1. 프로젝트 루트에 `.env.local` 파일을 생성합니다:
   ```bash
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

## 5. 애플리케이션 실행

### 개발 모드로 실행

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3100` 에서 열립니다(포트는 `package.json` 의 `dev` 스크립트에 고정).

### 빌드 · 테스트 · 린트

```bash
npm run build
```

```bash
npm test
```

```bash
npm run lint
```

## 스크립트 파일

- `setup-supabase.ps1`: Supabase 설정을 자동화
- `setup-db.ps1`: 스키마 적용 보조
- `configure-server.ps1`: 서버 환경 구성
- `verify-setup.ps1`: 설정 점검

Flutter 전용이던 `run-app.ps1` · `build-web.ps1` 은 2026-07-30 에 제거했습니다.

## 문제 해결

### 인증 관련 오류
- `.env.local` 파일의 키 값이 올바른지 확인하세요.
- Supabase 프로젝트가 정확히 설정되었는지 확인하세요.

### 데이터베이스 연결 오류
- Supabase 프로젝트 URL이 정확한지 확인하세요.
- 데이터베이스 스키마가 올바르게 적용되었는지 확인하세요.

### Edge Function 호출 오류
- Edge Functions가 정상적으로 배포되었는지 확인하세요.
- 환경 변수의 Service Role Key가 올바른지 확인하세요.