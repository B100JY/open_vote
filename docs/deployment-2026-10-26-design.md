# 모아이투표 프런트 디자인 운영 배포

- 사용자 배포 승인: 2026-10-26.
- 대상: `bjy-space/open-vote`, 운영 [vote.bluerdot.net](https://vote.bluerdot.net).
- 실행: 프로젝트 폴더에서 `npx vercel deploy --prod --yes --scope bjy-space`.
- 배포 ID: `dpl_AMUi4TimyECKNHLLaroSxcVGWQaP`.
- 배포 URL: [open-vote-d2fnoax1e-bjy-space.vercel.app](https://open-vote-d2fnoax1e-bjy-space.vercel.app).
- 결과: Vercel `READY`, 운영 도메인 연결 완료.
- 직전 운영 배포: `open-vote-i8imu7983-bjy-space.vercel.app`.

## 범위

Noto Sans KR과 공통 디자인, 간소한 홈·검색, 최종 D 선화 모아이 아이콘, 기존 영수증·검증 개선을 배포했다. 구글 로그인·6자리 코드·재발송·내 설정 등 최신 `origin/main`(`e454c4a`) 기능을 보존한 작업 트리 기준이다. 배포 직전 fetch에서 원격 추가 커밋은 없었다.

`.vercelignore`를 추가해 로컬 환경 파일·키·로그·MCP 설정·시안/문서·마이그레이션 폴더를 업로드에서 제외했다. 운영 환경변수의 이름과 등록 여부만 확인했으며 값을 출력하거나 변경하지 않았다. 실제 DB 마이그레이션·문자 발송·테스트 투표·계정 생성은 수행하지 않았다.

Git 커밋·푸시·머지 커밋은 수행하지 않았다. 배포된 소스는 현재 미커밋 작업 트리이며, 히스토리 정리는 별도 승인 후 진행해야 한다.

## 검증

- 배포 전 ESLint 통과, 테스트 86/86 통과.
- 운영 환경변수로 Vercel 원격 프로덕션 빌드·TypeScript 검사 통과.
- 운영 홈에서 D 아이콘·서비스명·6자리 코드 입력 표시 확인.
- `/`, `/admin`, `/trust`, `/privacy`, `/c`, `/settings`, 공개 투표 API: HTTP 200.
- 공개 투표 API는 정상 배열을 반환하고 `active` 상태만 포함했다. 개별 투표 데이터는 기록에 복사하지 않았다.
- 구글 시작 API: 303, Google 호스트로 이동, 운영 콜백 주소 일치 확인. client_id·state·쿠키 값은 출력하지 않았다.
- 로그인 버튼은 클라이언트가 인증 상태를 확인한 후 표시되므로 원시 HTML 검사 대신 실제 브라우저에서 확인했다.
- 운영 브라우저에서 구글 로그인 버튼 표시와 메뉴 이동 확인, 오류·경고 로그 없음.
- 실제 구글 로그인 완료·투표 제출·과금·발송은 미검증.

[배포 화면](frontend-refresh-2026-10-26/production-deployed.png)

## 후속: 정수리 빗금 제거

사용자가 식은땀처럼 보인다고 지적한 정수리의 `M35 15L39 27` 장식 선만 제거했다. 다른 도형은 유지한다. 배포 `dpl_ExLrQB1wufDadb5YSprP9XqvMmvN` / `open-vote-2g9vltjrf-bjy-space.vercel.app`으로 운영 반영 완료. 변경 컴포넌트 ESLint와 원격 프로덕션 빌드 통과.

## 후속: 공개 카드 정보·가독성·범용 서비스 문구

- 데스크톱에서도 검색창을 공개 투표 제목 바로 아래 왼쪽에 배치한다. 최대 너비 480px이며 모바일에서는 가용 너비를 쓴다.
- 소개 14→16px(모바일 13→14px), 코드 도움말·보조 링크·카드 메타·푸터 설명 12→14px, 코드 입력 제목 14→16px로 한 단계 확대했다.
- 홈 카드에서 선거 설명을 제거하고 선거 제목·번호·마감까지 남은 기간·투표 참여율을 표시한다. 하루 이상이면 남은 24시간 단위의 정수 일수, 하루 미만이면 시간·분으로 표시한다.
- 홈은 `/api/elections/public-summary`만 사용한다. DB에서도 `id,name,ends_at`만 조회하고 공개 요약 응답은 `id,name,deadline_label,participation_rate` 4개 필드만 허용한다. 설명·후보·명부 데이터를 홈 응답에 포함하지 않는다. 기존 상세 화면·API의 공개 범위 변경은 이번 범위에 포함하지 않는다.
- 참여율은 기존 `get_election_stats`를 재사용한다. 통계 실패는 0% 대신 확인 불가로 표시한다. DB 동시 요청 최대 4개, CDN 30초 캐시와 15초 재검증 허용, 클라이언트 자동 폴링 없음. 종료 시각이 지난 선거는 읽기 필터로 제외하며 DB 쓰기를 추가하지 않는다.
- 소개 문구의 노동조합을 제거하고 메타 설명을 범용 투표 서비스로 변경했다. 상단·푸터의 모아이투표 뒤 마침표를 제거했다.
- ESLint·빌드·테스트 89개 통과. 남은 기간 경계·통계 실패와 실제 0% 구분·공개 응답 허용 목록 검사를 추가했다. 마지막 일수 내림 조정 후 관련 검사 3개를 다시 실행해 통과했다.
- 로컬 실제 요약 API에서 응답 필드와 집계 값의 정상 반환, 설명 필드 없음 확인. 데스크톱·390px 모바일에서 배치와 가로 넘침 없음 확인.
- DB 마이그레이션·설정 변경·문자 발송·테스트 투표·계정 생성은 수행하지 않았다.

운영 배포: `dpl_9bkMaPvpNgJTLLWwd6w4QTbJaYVT` / `open-vote-21laozbk3-bjy-space.vercel.app` READY 및 `vote.bluerdot.net` 연결 완료. 마지막 일수 조정 후 로컬·원격 빌드 재통과. 운영 요약 API 응답 필드와 실제 stats API의 참여율 일치를 확인했다.
