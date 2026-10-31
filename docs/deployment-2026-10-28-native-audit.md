# 경량 감사 운영 적용 기록

> 후속: 사용자 요청으로 [추가 문자 인증 전용 템플릿](precast-otp-template-2026-10-28.md)을 운영 등록하고 Production 템플릿 환경변수를 준비했다. 발송 활성화와 재배포는 하지 않았으므로 아래 배포의 문자 인증 비활성 상태는 유지된다.

- 승인: 사용자 요청 “운영db적용하고 배포해줘”. 커밋·푸시·머지는 수행하지 않았다.
- 대상: 공유 Supabase `vvpmrzwjhzsjtieoweky`의 `app_open_vote`, Vercel `bjy-space/open-vote`, https://vote.bluerdot.net.
- 현재 작업 트리의 승인된 디자인·기능 통합을 포함한다. 브랜치 `fix/vote-receipt-guidance`, Git HEAD `7470e86`만으로 배포 소스를 재현할 수는 없다(미커밋 작업 포함).

## DB·설정

- 로컬 SQL: `supabase/migrations/20261028081621_native_audit.sql`.
- MCP `apply_migration` 성공: 이름 `openvote_native_audit_20261028`, 운영 이력 버전 `20261028120033`. 로컬 파일명 버전과 운영 적용 시각 버전이 다르므로 이름·내용으로 대조한다. CLI push/repair/pull은 사용하지 않았다.
- 적용 전후 선거 1개·투표 1개 유지. 기존 선거는 `audit_version=0`, 새 감사 선거 0개이며 자동 변환하지 않았다.
- 새 테이블 5개 RLS 활성·anon/authenticated/PUBLIC 테이블 권한 없음. 전체 `permission_baseline_violations()` 결과 `[]`.
- P-256 운영 서명키를 저장소 밖 사용자 전용 ACL 디렉터리에 생성하고 `MOAI_AUDIT_PRIVATE_JWK`를 Vercel Production의 sensitive 환경변수로 등록했다. 비밀값은 출력하지 않았고 DB에 넣지 않았다. 로컬 보관 파일은 사용자 홈 `.config/moai-vote/secrets/audit-production-20261028.json`; 내용 공유·커밋 금지. 실제 백업 복구 시험은 남아 있다.
- `MOAI_OTP_SEND_ENABLED=false`. 전용 코드 템플릿과 `MOAI_OTP_TEMPLATE`이 준비되지 않아 추가 문자 인증은 비활성이다. 해당 옵션으로 생성 시 과금 전에 503으로 중단한다. 기존 투표 초대 문자 설정은 변경하지 않았으며 실제 발송하지 않았다.

## 보안 업데이트·검증

- 배포 전 알려진 취약점 때문에 Next.js·eslint-config-next를 `16.2.6 → 16.4.3`으로 고정 업데이트했다. 나머지는 `npm audit fix`의 호환 범위 내 간접 의존성 패치를 적용했다. 강제 메이저 업데이트는 하지 않았다.
- 최종 `npm audit`: 0건, `npm audit --omit=dev`: 0건.
- 최종 단위 검사 107/107, ESLint, 로컬 Next.js 16.4.3 빌드 통과.
- 격리 PostgreSQL에서 마이그레이션 2회, 권한, 동시·중복 접수, 기존 경로 우회 방지, 마감 경계, OTP 모의 처리·환불, 네 투표 방식 별도 집계 교차 검사를 통과했다.
- `MOAI_TEST_HTTP=1 npm run test:audit-db`: 실제 Next HTTP → 격리 REST 하네스 → 합성 PostgreSQL → 서명 → 마감 공개 묶음 검증 통과. 운영 연결·문자는 사용하지 않았다.

## 배포·운영 확인

- Vercel 배포: `dpl_3VH5eJBHX3ea2LVx3kP1CrtJ5opp`.
- 배포 주소: https://open-vote-r8ndosxen-bjy-space.vercel.app.
- `deploy --prod --skip-domain`으로 Production 환경 빌드를 먼저 만들고 공개 경로를 검사한 뒤 `vercel promote` 성공. 공식 도메인에서도 아래 검사를 반복했다.
- `/`, `/trust`, `/verify`, `/audit-verifier.html`, `/api/elections/public-summary`: HTTP 200.
- 배포된 오프라인 검증기와 로컬 생성 파일의 SHA-256 동일.
- 기존 선거 감사 조회는 `legacy:true`; 없는 선거는 404. 인증 없는 명부 조회는 401. 응답에서 비밀 명부·키 필드 없음.
- 구글 로그인 시작 303, Google 호스트·운영 콜백 주소·state 쿠키 정상. 실제 계정 로그인 완료는 시험하지 않았다.
- 최종 DB 재확인: 선거 1개·투표 1개·감사 선거 0개, 권한 위반 없음. 운영에 시험 선거·기표·계정은 만들지 않았다.

## 남은 확인·복구

- 실제 새 감사 선거 생성·기표·과금은 운영에서 실행하지 않았다. 실제 휴대폰 수신·저사양 단말 성능·키 백업 복구·외부 기준점 보존은 합성 시험으로 대체하지 않는다.
- 추가 문자 인증을 활성화하려면 코드 전용 템플릿을 별도로 준비하고 발송 승인·운영 검증 후 환경변수와 배포를 갱신한다.
- 이전 배포로 되돌릴 때 DB를 삭제하거나 마이그레이션 원장을 repair하지 않는다. 새 감사 선거가 생긴 뒤에는 레거시 기표가 감사 선거에서 거부되므로 단순 구버전 롤백은 그 선거의 제출 화면을 중단시킬 수 있다. 현재는 감사 선거 0개다.
- 진행 중인 감사 선거가 생기면 기존 서명키를 보존한다. 환경변수의 무계획한 키 교체는 새 확인증 서명을 중단시킨다.
