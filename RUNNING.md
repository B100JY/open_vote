# Open Vote - 실행 가이드

Open Vote 애플리케이션을 실행하기 위한 단계별 안내서입니다.

## 사전 요구 사항

- [Flutter SDK](https://flutter.dev) (버전 3.10 이상)
- [Node.js](https://nodejs.org) (Supabase CLI를 설치하기 위해 필요)

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

## 3. Edge Functions 배포

1. Supabase CLI를 설치합니다: `npm install -g supabase`
2. 로그인: `supabase login`
3. 프로젝트 연결: `supabase link --project-ref YOUR_PROJECT_REFERENCE`
4. 함수 배포:
   - `supabase functions deploy cast_vote`
   - `supabase functions deploy generate_voter_codes`

## 4. 환경 변수 설정

1. 프로젝트 루트에 `.env.local` 파일을 생성합니다:
   ```bash
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

## 5. 애플리케이션 실행

### 개발 모드로 실행

Windows PowerShell에서 다음 명령어를 실행합니다:

```powershell
.\run-app.ps1
```

또는 수동으로 다음과 같이 실행할 수 있습니다:

```bash
flutter run -d chrome \
  --dart-define=SUPABASE_URL=your_supabase_url \
  --dart-define=SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 웹 애플리케이션 빌드

Windows PowerShell에서 다음 명령어를 실행합니다:

```powershell
.\build-web.ps1
```

빌드된 파일은 `build/web/` 폴더에 생성됩니다.

## 스크립트 파일

이 프로젝트에는 여러 유용한 스크립트가 포함되어 있습니다:

- `run-app.ps1`: 애플리케이션을 개발 모드로 실행
- `build-web.ps1`: 웹 애플리케이션을 빌드
- `setup-supabase.ps1`: Supabase 설정을 자동화

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