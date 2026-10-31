# 관리자 메뉴·내 투표 소유자 목록 수정

## 사용자 신고·원인

- 관리자 로그인 시 회원 승인·포인트 관리 메뉴를 더 쉽게 찾을 수 있도록 요청했다.
- 이어 생성자로 로그인했는데 다른 계정의 투표가 ‘내 투표 관리’에 나타난다는 신고가 있었다.
- 목록 API가 creator에 대해 `공개 상태(active,closed) OR created_by=본인`을 반환하고 있었다. 공개 탐색과 관리 목록을 한 쿼리로 섞어 쓰던 것이 원인이다.

## 변경

- 상단 ‘관리자’ 메뉴는 `/api/auth/me`의 현재 앱 회원 권한이 admin일 때만 표시한다. 같은 토큰의 중복 확인을 합치며 주기적인 폴링은 하지 않는다. 로그아웃·계정 전환·조회 실패 시 숨긴다.
- 관리자 홈 `/admin/manage`: 회원 승인(`/admin/members`), 포인트 관리(`/admin/credits`), 전체 투표 관리(`/admin/manage/elections`). 모두 기존 AdminGate 및 서버 API 인가를 유지한다.
- `/admin/elections`: 관리자 계정도 **본인이 만든 투표만** 보여주는 ‘내 투표 관리’다. 요청은 `scope=mine`으로 고정한다.
- `/admin/manage/elections`: 관리자만 접근하고 `scope=all`로 전체 상태·소유자의 투표를 조회한다.
- GET `/api/elections`의 범위를 public / mine / all로 분리했다. mine은 생성자 이상 로그인과 `created_by` 필터, all은 서비스 관리자 권한이 필수다. 잘못된 인증을 공개 목록으로 폴백하지 않는다.
- 구버전 관리 화면을 위해 scope 없이 인증 헤더만 보내도 mine으로 제한한다. 명시적인 `visibility=public`과 비로그인 탐색은 기존 공개 active/closed 범위를 유지한다.
- 준비중·일시중단 투표의 상세 조회도 소유자/관리자에게만 허용한다. 목록·상세 응답은 `private, no-store`다.
- CSV/명부 조회, 상태 변경, 문자 발송·재발송·문자 제목/감사 설정은 기존 `canManageElection` 소유자 검사를 점검했다.
- AdminGate는 계정 ID 변경 시 이전 관리 화면을 숨기고 새 계정으로 확인한다. 자식 트리도 계정 ID로 다시 마운트해 이전 계정의 목록·명부 상태가 남지 않게 한다. 같은 계정의 토큰 갱신 때는 입력 폼을 초기화하지 않는다.
- 회원·포인트 화면의 돌아가기 링크를 관리자 홈으로 연결했다. 좁은 화면에서 관리자 메뉴 추가로 가로 넘침이 생기지 않게 메뉴 줄바꿈을 허용한다.

## 검증·범위

- `scripts/test-election-access.mjs`: 실제 목록/상세/명부/상태 변경 라우트 및 실제 앱 회원 인가 함수를 합성 인증·DB 경계에서 실행했다.
- creator A/B의 각각 소유한 draft/active/paused/closed만 반환, admin의 mine과 all 구분, 비로그인·pending·다른 앱 인증 거부, 공개 목록의 상태 제한, 타인의 비공개 상세·명부 조회·상태 변경 거부, no-store 검사가 통과했다.
- 기존 단위 검사 109/109, ESLint, Next.js 16.4.3 빌드 통과.
- 실제 사용자 계정으로 로그인·승인·포인트 지급은 실행하지 않았다. 역할 재현 검사는 합성 계정으로 했으며 운영 사용자의 세션을 가져오거나 대리 로그인하지 않았다.
- DB 마이그레이션·역할 변경·포인트 조작·문자 발송 없음. 기존 워크트리 보존, 커밋·푸시·머지 없음.

## 배포

- 대상: `bjy-space/open-vote` / https://vote.bluerdot.net.
- Production staged 배포: `dpl_6GD1hX4fpS5XTzvUeaQwm6eNaKsr` / https://open-vote-idblb9alp-bjy-space.vercel.app.
- staged 배포에서 홈/관리 페이지 200, 인증 없는 mine/all·명부 401, 잘못된 인증 mine 401, 잘못된 scope 400, 공개 목록 200을 확인한 뒤 promote했다.
- https://vote.bluerdot.net 에서 관리자 홈·전체 투표 관리·내 투표 관리 페이지 200, 비로그인 mine/all 401, 공개 목록 200을 다시 확인했다. 실제 계정 간 권한 판정은 위 합성 회귀 검증이며 실제 사용자 계정으로 로그인하지 않았다.
- 사이트를 새로고침하면 새 메뉴와 관리 목록 범위를 사용한다. 기존 선거 소유자나 회원 권한을 DB에서 바꾸지 않았다.
