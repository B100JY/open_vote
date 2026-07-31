<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 이 Supabase 프로젝트는 세 앱이 공유합니다

프로젝트 `vvpmrzwjhzsjtieoweky` 를 **노조링크(`app_nozolink`) · OpenVote(`app_open_vote`) ·
Cowork(`public`)** 가 함께 씁니다. `auth.users` · 세션 · 신원(`auth.identities`) ·
`app_metadata` · 커스텀 액세스 토큰 훅(**프로젝트당 1개**) · OAuth 설정은 **전부 공유
자원**이고, 세 앱이 같은 `service_role` 키를 들고 있어 권한으로 나눌 수 없습니다.

**`authenticated` 는 "우리 사용자"가 아닙니다.** 세 앱이 `auth.users` 를 공유하고 구글
가입은 누구나 할 수 있으므로, RLS 정책이나 인가 로직에서 `authenticated` 를 신뢰 경계로
쓰면 안 됩니다.

## 앱 간 파괴 행위 — 하지 마십시오

SDK 로 부르든 admin REST 로 직접 부르든 동일합니다. `src/lib/__tests__/shared-auth-guard.test.ts`
가 양쪽 형태의 부재를 고정합니다.

| 행위 | 결과 |
|---|---|
| `signOut()` (인자 없음 = `scope:'global'`) | 그 사용자의 **다른 앱 세션이 전 기기에서** 끊김. 계정 전환이면 `signOut({ scope: 'local' })` |
| `auth.admin.deleteUser` | FK 를 타고 세 앱 데이터가 함께 삭제됨 |
| `auth.admin.unlinkIdentity` | 다른 앱의 로그인 수단일 수 있음. GoTrue 의 "신원 2개 이상" 규칙은 그 신원이 **다른 앱에서** 어떤 의미인지 모름 |
| `updateUserById({ email \| password })` | 공유 계정의 로그인 수단을 바꿈 |
| `DELETE /auth/v1/admin/users/...` | 위와 같은 행위의 REST 형태. 이름 검사를 우회함 |

OpenVote 에는 현재 이 경로가 하나도 없습니다(로그아웃 2곳은 `scope: 'local'`).
정말 필요해지면 3자 합의 후 가드 테스트에 예외를 명시하십시오.

`auth.users` 삭제로 OpenVote 의 과금 자산(`credit_accounts` · `credit_transactions` ·
`point_wallets` · `point_ledger` · `api_clients`)이 사라지지 않도록 해당 FK 는
`ON DELETE RESTRICT` 입니다. 정당한 삭제는 각 앱이 자기 행을 먼저 지운 뒤
**마지막에** `auth.users` 를 지우는 순서로만 가능합니다.

## `app_open_vote` 권한 기준선

**`anon` · `authenticated` 가 이 스키마에서 갖는 권한은 `ballots` 의 SELECT 하나뿐입니다**
(`/dashboard` · `/results` 의 Realtime 원장 구독용). 표·함수·시퀀스의 나머지 권한은 0입니다.

새 객체를 추가할 때:

- 클라이언트 롤에 그랜트를 주지 마십시오.
- **새 함수마다** `REVOKE EXECUTE ON FUNCTION ... FROM public, anon, authenticated;` 를
  마이그레이션에 명시하십시오. 함수의 `PUBLIC EXECUTE` 는 Postgres 하드와이어드 기본값이라
  스키마 단위 `ALTER DEFAULT PRIVILEGES` 로 지워지지 않습니다.
- 함수에 `SET search_path` 를 고정하십시오(이 스키마 관례는 `app_open_vote, extensions`).
- 마이그레이션 끝에서 확인: `select app_open_vote.assert_permission_baseline();`

전역(`IN SCHEMA` 없는) `ALTER DEFAULT PRIVILEGES` 는 세 앱 공유 자원이라 **3자 합의**가
필요합니다. 스키마 단위는 각 앱 자유입니다.

## 더 읽을 것

[docs/shared-auth-openvote.md](docs/shared-auth-openvote.md) — OpenVote 의 클레임 정의
(RESTRICT FK 5개), 계정 삭제 시 해제 순서, `core` 스키마 표면 실측, 3자 계약 문서에
제출할 항목. 코드로 막을 수 없는 것들(대시보드 신원 해제·설정 변경)이 왜 문서로만
통제되는지도 여기 있습니다.
