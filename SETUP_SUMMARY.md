# Open Vote - 설정 요약

> ⚠️ **이 문서는 2026-05 초기 설정 시점의 기록입니다. 현행 안내가 아닙니다.**
> - Flutter Web 앱과 `run-app.ps1` · `build-web.ps1` 은 2026-07-30 에 제거했습니다.
>   현행 실행은 `npm run dev` 입니다([RUNNING.md](RUNNING.md) 참조).
> - 배포할 엣지 함수가 없습니다. `cast_vote` · `generate_voter_codes` 는 배포된 적이
>   없는 레거시였고 2026-07-30 에 제거했습니다.
> - 아래 적힌 Supabase 프로젝트(`zxrwlwhbcivwpvmktuoj`)는 **현행 프로젝트가
>   아닙니다.** 현행은 `vvpmrzwjhzsjtieoweky` 이며 `app_open_vote` 스키마를 씁니다.

## 완료된 작업

✅ **프로젝트 구조 분석**
- Flutter 애플리케이션 구조 확인
- Supabase 통합 구조 확인
- 데이터베이스 스키마 및 함수 파일 확인

✅ **환경 설정**
- `.env.local` 파일에 API 키 설정 완료
- `opencode.json`에 MCP 설정 추가
- 프로젝트 참조: `zxrwlwhbcivwpvmktuoj`

✅ **스크립트 생성**
- `run-app.ps1`: 애플리케이션 실행 스크립트
- `build-web.ps1`: 웹 애플리케이션 빌드 스크립트
- `verify-setup.ps1`: 설정 검증 스크립트
- `configure-server.ps1`: 서버 구성 스크립트
- `setup-supabase.ps1`: Supabase 자동 설정 스크립트

✅ **서버 구성 파일**
- `supabase/config.toml`: Supabase 구성 파일 생성
- `MANUAL_SETUP.md`: 수동 설정 지침 제공

## 필요한 추가 작업

🔴 **Supabase 대시보드 설정 (수동)**  
- [ ] 데이터베이스 스키마 적용
- [ ] Edge Functions 배포
- [ ] 함수 환경 변수 설정

🟢 **애플리케이션 테스트**
- [ ] `.\run-app.ps1` 실행
- [ ] 관리자 페이지 기능 테스트
- [ ] 유권자 인증 및 투표 기능 테스트

## 다음 단계

1. **MANUAL_SETUP.md** 파일의 지시에 따라 Supabase 대시보드에서 수동 설정을 완료하세요.
2. 설정 완료 후 `.\verify-setup.ps1`를 실행하여 연결 상태를 확인하세요.
3. `.\run-app.ps1`를 실행하여 애플리케이션이 제대로 작동하는지 확인하세요.

## 참고 정보

- **Supabase Project URL**: https://zxrwlwhbcivwpvmktuoj.supabase.co
- **Supabase Anon Key**: 설정됨 (JWT 토큰)
- **Supabase Service Role Key**: 설정됨 (JWT 토큰)
- **Edge Functions**: 
  - `cast_vote`: 익명 투표 처리
  - `generate_voter_codes`: 인증 코드 생성

---

축하합니다! Open Vote 시스템의 서버 설정을 위한 모든 준비가 완료되었습니다. Supabase 대시보드에서 몇 가지 수동 설정만 완료하면 시스템이 완전히 작동합니다.