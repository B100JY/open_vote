# 공용 auth — OpenVote 제출분

**대상 프로젝트:** `vvpmrzwjhzsjtieoweky` (노조링크 · OpenVote · Cowork 공유)
**작성:** 2026-07-31
**용도:** 3자 계약 문서 `docs/shared-auth-contract.md` 에 넣을 OpenVote 몫.
공동 문서가 만들어지면 그쪽으로 합치고 이 파일은 참조만 남긴다.

> **왜 문서인가:** 세 앱이 각자 FK RESTRICT 를 걸어도 **코드로 막을 수 없는 경로**가 남는다 —
> 대시보드에서의 신원 해제·사용자 삭제, 대시보드 설정 변경(OAuth provider, 리다이렉트
> 허용목록, JWT 만료, 토큰 훅, SMTP/SMS). `auth.identities` 삭제를 막는 FK 는 존재할 수 없고,
> `auth.audit_log_entries` 는 비어 있어 사후 조사도 어렵다.
> **"하지 않는다"는 합의가 실제 방어선이다.**

---

## 1. OpenVote 의 클레임 정의

**클레임 = `auth.users` 로 향하는 `ON DELETE RESTRICT` FK 가 걸린 표. 정확히 5개.**

| 표 | 컬럼 | 제약 |
|---|---|---|
| `app_open_vote.credit_accounts` | `user_id` | `credit_accounts_user_id_fkey` |
| `app_open_vote.credit_transactions` | `user_id` | `credit_transactions_user_id_fkey` |
| `app_open_vote.point_wallets` | `owner_user_id` | `point_wallets_owner_user_id_fkey` |
| `app_open_vote.point_ledger` | `owner_user_id` | `point_ledger_owner_user_id_fkey` |
| `app_open_vote.api_clients` | `owner_user_id` | `api_clients_owner_user_id_fkey` |

### 노조링크 요청 — 헬퍼에서 두 개를 빼 주십시오

`findExternalAccountClaims` 가 OpenVote 클레임으로 `api_clients.owner_user_id` ·
`voter_registry.auth_user_id` · `elections.created_by` 를 읽습니다.
**뒤의 두 개는 빼 주십시오.**

**`elections.created_by` 는 중복입니다** — 보호가 하나도 늘지 않고 **잘못된 차단만** 생깁니다.
선거를 만드는 두 경로 모두 생성자가 이미 위 5개 표에 잡힙니다:

- **연동 경로** — `src/app/api/v1/elections/route.ts` 가 `p_created_by: client.owner_user_id`
  를 넘깁니다. 생성자 = `api_clients.owner_user_id`. **이미 보호됨.**
- **독립형 경로** — `create_billed_election` 이 선불 차감이므로 생성자는 `point_wallets`
  행을 반드시 보유합니다. **이미 보호됨.**

부작용은 구체적입니다: SSO 핸드오프로 선거를 만든 노조링크 관리자가 나중에 **자기 앱에서
자기 소셜 연결을 해제하려 할 때** "다른 앱이 쓰고 있다"로 막힙니다.
`elections` 가 0행인 지금은 무해하지만 첫 선거에서 나타납니다.

**`voter_registry.auth_user_id` 는 중복이 아니라 의도적 제외입니다.**
초대 유권자 계정이 삭제되면 그 사람은 로그인을 잃지만 명부 행은 SET NULL 로 **생존**하고
재초대로 복구됩니다. 노조링크(회원 자격 소멸)·Cowork(방장 권한 영구 잠김)와 등급이 달라
지금은 보호하지 않습니다. 나중에 보호로 전환하면 그때 RESTRICT 가 걸리고 자동으로
클레임이 됩니다.

### 제안 — 표 목록을 하드코딩하지 말고 카탈로그에서 유도

```sql
select n.nspname as app_schema, t.relname as table_name, c.conname
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where c.contype = 'f'
  and c.confrelid = 'auth.users'::regclass
  and c.confdeltype = 'r';        -- RESTRICT = 그 앱이 주장하는 계정
```

각 앱이 자기 RESTRICT 를 바꿀 때 남의 앱 코드를 고칠 필요가 없고,
**"클레임의 단일 정의"가 문서 합의가 아니라 DB 사실**이 됩니다.

---

## 2. OpenVote 몫 해제 순서

세 앱이 각자 RESTRICT 를 걸면 공유 계정은 서로를 잠급니다. **한 팀이 혼자 지울 수 없습니다.**
이 절차를 적어두지 않으면 첫 정당한 탈퇴 요청이 장애가 됩니다.

```
① api_clients                          — API 키
② credit_transactions · point_ledger   — 원장 (보존 여부 판단 필요)
③ credit_accounts · point_wallets      — 잔액
```

그 다음 다른 앱이 각자 자기 행을 지우고, **마지막 팀이 `auth.users` 를 지웁니다.**
조율 담당은 공동 계약 문서에서 정합니다.

OpenVote 에는 `deleteUser` 호출 경로가 없으므로(실측) 이 절차의 마지막 단계를
OpenVote 가 수행할 일은 현재 없습니다.

---

## 3. 분리 비용 — OpenVote 는 가장 **싼** 쪽입니다

초기 논의에서 "OpenVote 는 SSO 핸드오프가 프로덕션이라 분리 비용이 가장 크다"고
적었는데, **근거 없는 주장이었습니다. 실측은 반대입니다.**

| 앱 | 이관할 데이터 | 재구축할 것 |
|---|---|---|
| 노조링크 | 회원·관리자 계정 + 30여 표 | — |
| Cowork | 회원·게스트 계정, 방·메시지·할일 | 구글 로그인 재연결 |
| **OpenVote** | **13개 표 전부 0행 · 소유 계정 0개** | 세션 핸드오프 1경로 |

`src/lib/handoff.ts` 의 HMAC 은 **컨텍스트**(`union_id`, `purpose`, `exp`)만 서명하므로
프로젝트를 분리해도 그대로 동작합니다. 공유 `auth.users` 에 의존하는 것은 **세션 전달**뿐이고
(`generateLink` → `verifyOtp`, 같은 uid), OpenVote 측은 `/auth/handoff` **라우트 1개**입니다.

**분리를 하자는 주장이 아닙니다.** "OpenVote 가 가장 비싸다"를 전제로 논의하면 틀린 결론에
도달하므로 정정합니다. 이 값은 `elections` · `credit_accounts` 에 행이 쌓이면 돌아오지 않습니다.

---

## 4. `core` 스키마 표면 — 실측 (2026-07-31)

클레임 레지스트리(`core.memberships`) 안이 검토되던 중 확인한 것입니다.
**레지스트리는 취소됐지만, `core` 가 닫혀 있다는 사실은 기록해 둘 가치가 있습니다** —
다음에 누가 공유 저장소를 찾을 때의 출발점이 됩니다.

`core` 는 PostgREST 노출 스키마입니다(`pgrst.db_schemas = public, graphql_public, core,
app_nozolink, app_open_vote`). 그럼에도 표면은 닫혀 있었습니다:

| 표 | `anon` | `authenticated` | 정책 |
|---|---|---|---|
| `core.apps` | **그랜트 없음** | SELECT | `apps_read` — `true` (앱 카탈로그, 민감정보 아님) |
| `core.memberships` | **그랜트 없음** | SELECT | `memberships_select_self` — `user_id = auth.uid()` |
| `core.profiles` | **그랜트 없음** | SELECT · UPDATE | `profiles_select_self` / `profiles_update_self` — 둘 다 `id = auth.uid()` |

클라이언트 롤에 **쓰기 권한이 없고** 읽기도 자기 행 한정이라, 클라이언트가 위조할 수
없습니다. 향후 공유 메타데이터를 둘 자리가 필요하면 여기가 후보입니다.

---

## 5. `app_open_vote` 권한 기준선

2026-07-30 적용. `anon` · `authenticated` 가 이 스키마에서 갖는 권한은
**`ballots` 의 SELECT 하나뿐**입니다(`/dashboard` · `/results` 의 Realtime 원장 구독용).

```sql
select app_open_vote.assert_permission_baseline();   -- 위반 시 예외
```

새 함수를 만들 때마다 `REVOKE EXECUTE ON FUNCTION ... FROM public, anon, authenticated;`
가 필요합니다 — 함수의 `PUBLIC EXECUTE` 는 Postgres 하드와이어드 기본값이라 스키마 단위
`ALTER DEFAULT PRIVILEGES` 로 지워지지 않습니다. 전역 ADP 로는 지울 수 있지만 모든 스키마에
걸려 Cowork 의 `cowork_guest` 를 멈추므로, **전역 ADP 는 3자 합의 사항**입니다.

---

## 6. OpenVote 가 하지 않는 것 (실측 확인)

`deleteUser` · `unlinkIdentity` · `updateUserById` 호출이 **0건**이고,
admin REST 엔드포인트 직접 호출도 없습니다. 로그아웃 2곳은 `scope: 'local'` 입니다.

이 부재는 `src/lib/__tests__/shared-auth-guard.test.ts` 가 고정합니다 —
SDK 메서드명과 REST 경로 양쪽을 검사합니다. 열어야 할 일이 생기면 3자 합의 후
그 테스트에 예외를 명시합니다.
