# 최신 main 기능과 프런트 디자인 통합

기록일: 2026-10-26. 사용자가 최신 main 기능과 디자인의 통합을 승인했다.

## 원인

디자인 작업 브랜치 `fix/vote-receipt-guidance`의 HEAD는 `7470e86`이었고, 원격을 fetch한 뒤 확인한 `origin/main`은 `e454c4a`로 12개 커밋 앞서 있었다. 로컬에는 이전 이메일·비밀번호 가입 화면이 남아 있었다. 디자인 수정이 구글 로그인 코드를 삭제한 것이 아니라, 해당 변경이 들어오기 전의 작업 트리에서 디자인 작업을 시작한 것이 원인이다. 최초 작업 때 원격 최신 기능과 기준선을 확인하지 못했다.

누락되어 있던 기능:

- 구글 가입·로그인, 개인정보처리방침
- 내 설정과 이름 변경
- 영문·숫자 6자리 투표 코드, 투표별 안내 화면, 본인 재발송
- 관리자 개별 재발송, 문자 제목, 서버 지역 설정
- 기본 단가 30P와 관련 검사

## 충돌 검사와 해결

HEAD·작업 트리·origin/main의 세 버전을 파일별로 검사했다. CRLF/LF 차이를 정규화한 실제 결과는 upstream 변경 66개 파일 중 신규 32개, 로컬 미변경 15개, 자동 병합 11개, 수동 판단이 필요한 충돌 8개였다. 최초 줄끝 정규화 전 결과는 사용하지 않았다.

| 수동 판단한 파일 | 반영 기준 |
| --- | --- |
| README.md | 최신 main 설명 |
| src/app/api/auth/me/route.ts | 최신 main의 내 설정 API 포함 버전 |
| src/app/api/auth/register/route.ts | 최신 main의 비밀번호 신규 가입 중단(410) |
| src/components/admin-gate.tsx | 최신 main의 구글 가입·로그인, 기존 회원 비밀번호 로그인 보조 경로 |
| src/app/layout.tsx | 현재 Noto Sans KR과 모아이투표 명칭 유지 |
| src/app/page.tsx | 현재 간소한 디자인에 최신 CodeEntry·번호 검색·투표 안내 경로 통합 |
| src/components/app-frame.tsx | 현재 디자인에 내 투표 관리·내 설정·개인정보처리방침 진입점 반영 |
| src/app/trust/page.tsx | 기존 영수증 공유 주의·보안 설명 수정 보존, 명칭과 조사 교정 |

자동 병합된 생성 폼의 문자 제목과 번호별 구역, 결과·검증 화면의 election 쿼리 선택과 기존 영수증 개선도 함께 확인했다.

상단 로고와 홈에 재사용 가능한 모아이 석상 SVG 컴포넌트를 추가했다. 외부 이미지 요청이나 이미지 패키지는 사용하지 않는다.

최종 선택: 사용자가 C 선택을 정정해 **D ‘가벼운 선화’**를 선택했다. D안의 동일한 도형과 색상을 공통 아이콘에 적용하고, 상단 로고와 홈에 반영했다. 작은 로고의 배경은 시안처럼 밝은 파란색으로 유지한다.

이전 디자인 작업에서 임시로 추가한 `vote-entry.ts`와 해당 검사 2개는 실제 최신 6자리 코드 구현으로 대체해 제거했다. 이제 홈은 링크 토큰을 코드라고 안내하지 않는다. 6자리 코드는 최신 main처럼 메모리로 `/c`에 전달하며 주소·브라우저 저장소에 싣지 않는다.

## 보존과 Git 상태

통합 직전 변경 파일 사본: `C:/Users/BJY/AppData/Local/Temp/open-vote-main-integration-9z58wh76/backup/`.

다른 에이전트의 영수증·검증 변경, 로그, 기존 문서와 ESLint 설정을 보존했다. 개인 `.env.local`과 운영 설정은 변경하지 않았다. 새 마이그레이션 파일은 origin/main에 이미 존재하는 두 파일의 로컬 반영이며 운영 적용은 수행하지 않았다.

**파일 내용을 작업 트리에서 통합한 상태다. 커밋·Git merge commit·브랜치 HEAD 변경·푸시·배포는 수행하지 않았다.** HEAD는 계속 `7470e86`이므로, 나중에 사용자 승인으로 커밋할 때 최신 main 기준선과 히스토리 연결도 함께 처리해야 한다. `git diff origin/main`은 HEAD에서 아직 미추적 상태인 새 파일을 삭제로 표시할 수 있다. 파일 존재·내용을 함께 확인해야 한다.

## 검증

- `npm test`: 86/86 통과. 구글 claims·OAuth URL, 투표 코드 정규화·HMAC, 공유 auth 파괴 방지, 기존 영수증 검사 포함.
- `npm run lint`: 통과.
- `npm run build`: 통과. Google start/callback, `/c`, 코드·재발송 API, 내 설정·개인정보처리방침·투표 안내 경로 생성 확인.
- `git diff --check`, 충돌 표시 검색: 통과.
- 주요 인증 파일·문자 발송 모듈·과금 모듈이 최신 origin/main과 일치함을 확인했다.
- 브라우저에서 모아이 아이콘·홈, 구글 가입·로그인 버튼, 메뉴 이동을 확인했다. 390px 모바일 설정에서 문서 가로 넘침 없음.
- 실제 구글 로그인 완료·실제 코드 투표·재발송은 미검증이다. 로컬 Google OAuth 설정과 `OPENVOTE_CODE_PEPPER`가 없음을 **존재 여부만** 확인했다. 운영 설정 상태는 이번에 조회하지 않았다.
- Supabase 최신 변경 기록과 [verifyOtp 문서](https://supabase.com/docs/reference/javascript/auth-verifyotp)를 확인했다. 운영 SQL·Auth 설정 변경은 수행하지 않았다.

화면 증거:

- [구글 로그인 복원](frontend-refresh-2026-10-26/google-login-restored.png)
- [모아이 홈 모바일](frontend-refresh-2026-10-26/moai-home-mobile.png)
- [모아이 홈 데스크톱](frontend-refresh-2026-10-26/moai-home-desktop.png)
