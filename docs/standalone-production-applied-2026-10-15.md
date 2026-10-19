# 독립 회원 DB·비밀투표 운영 적용 완료 (2026-10-15)
사용자 요청: 이전 1·2단계의 미완료 작업 재시도.

## 적용
- 격리 PostgreSQL 17, 127.0.0.1:55435: 운영 app_open_vote의 테이블 정의·제약·함수를 데이터 없이 재현. auth는 최소 스텁. 양 SQL 적용 및 재적용 통과.
- 운영 Supabase vvpmrzwjhzsjtieoweky에 기존 20261010000000 및 20261014000000 SQL을 합쳐 apply_migration 적용.
- 운영 이력 이름: openvote_ballot_secrecy_and_standalone_members_20261015.
- OPENVOTE_SIGNUP_INVITE_CODE: 무작위 서버 전용 코드, Vercel production Sensitive 저장. 채팅·문서에 값 기록하지 않음.
- 새 코드 CLI 배포 후 promote 완료: dpl_8pXUCAkgCNSwbUVEMLnqw3rKmBKg.
- 운영 주소: https://openvote.bluerdot.net
- 배포는 feat/ballot-types-and-secrecy HEAD 64271c9 + 기존 미커밋 독립회원 구현을 포함한 로컬 파일 기준. 커밋·푸시하지 않음.

## 검증
- 자동 테스트 68/68, src ESLint, 로컬 및 Vercel 프로덕션 빌드 통과.
- 격리 DB 실제 실행: 서비스 롤 가입·로그인 제한, 100P→90P 선거생성 차감, 전화번호 명부 등록, 기표, 중복 차단, 명부 updated_at 불변, 종료 전 결과 차단, 종료 후 1표 결과, 종료 재개 차단.
- 운영 assert_permission_baseline 통과.
- anon·authenticated ballots SELECT false. ballots·voter_registry Realtime 0건.
- ballots 순번·체인 칼럼 삭제 확인.
- 운영 HTTP: /admin 및 /admin/members 200, 미로그인 /api/auth/me 401, 잘못된 초대코드 가입 403, 노조링크 연동 /api/v1/wallet 410.
- 운영 회원 수 0: 가입·최초 관리자 지정 및 실제 문자/전체 E2E는 다음 3·4단계로 남음.
- 실제 사용자 비밀번호를 생성·변경하지 않았으며, 운영 시험 회원·선거를 만들지 않음.

## 다음
사용자가 /admin에서 unionk25@gmail.com으로 OpenVote 전용 가입. 초대코드는 로컬 .env.local의 OPENVOTE_SIGNUP_INVITE_CODE에 비공개로 보관. 해당 값을 화면·채팅에 출력하지 않고 가입 입력란에 사용.
가입 후 별도 최초 관리자 지정 절차, 포인트 및 실제 선거 E2E 수행.
