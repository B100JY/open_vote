# 통지 — open_vote: 분리 없음, Phase B는 예정대로 (그리고 그것이 다른 팀의 전제입니다)

**받는 쪽:** open_vote (`app_open_vote`)
**작성:** 2026-07-31
**요약:** open_vote가 새로 할 일은 **없습니다.** 다만 **이미 계획된 Phase B가
nozolink 정리 작업의 전제 조건**이 되었으니 그 사실만 알아두십시오.

---

## 0. 결정 사항

| 항목 | 결정 | open_vote 영향 |
|---|---|---|
| 프로젝트 분리 | ❌ **안 함.** 1개 유지 | 핸드오프 그대로. **재작업 0** |
| Cowork 구글 로그인 | GoTrue provider → **ID 토큰 자체 검증**으로 전환 | 없음 |
| nozolink 전화 가입 → 소셜 링크 | 변경 없음 | 없음 |
| **open_vote Phase B (과금 FK 5개 RESTRICT)** | ✅ **예정대로 진행** | **§2 — 우선순위가 올라갔습니다** |
| Phase C (초대 uid를 `audit_logs`에) | 그대로 | 1줄 |

**open_vote는 이 라운드에서 소셜 로그인 논의의 당사자가 아닙니다** —
`signInWithOAuth`·`linkIdentity` 호출이 **0건**이라는 실측이 이 결정의 근거 중 하나였습니다.
그 사실이 "충돌 원인은 Cowork 하나뿐"이라는 결론을 세우는 데 쓰였습니다.

---

## 1. 왜 분리하지 않기로 했나

nozolink Supabase Pro 전환을 앞두고 비용을 따져본 결과:

- **유료 혜택(무일시정지·백업·할당량)은 조직 단위**로 공유됩니다. 프로젝트를 합칠 이유가
  원래 없었습니다 — 합쳐서 아끼는 것은 **compute 월 $10**뿐이었습니다.
- 그런데 Cowork가 지인 대상 소규모 서비스라 그 $10도 피하고 싶다는 판단이 있었고,
- 충돌 원인이 **Cowork의 구글 신원 하나**로 좁혀지면서, 그것만 GoTrue 밖으로 빼면
  **$0로 같은 결과**를 얻을 수 있음이 확인됐습니다.

**결과적으로 open_vote에게는 가장 좋은 결론입니다** — SSO 핸드오프
(`generateLink` → `verifyOtp`, 같은 uid)가 **손도 안 대고 그대로** 갑니다.

> 참고: 이전 라운드에서 "open_vote가 분리 비용이 가장 크다"는 초기 주장을
> 스스로 정정하신 것, 그리고 실측(13개 표 0행 · 소유 계정 0)으로 뒷받침하신 것이
> 이번 판단의 입력이 됐습니다. 정확했습니다.

---

## 2. Phase B의 지위가 바뀌었습니다 — 이제 다른 팀이 기다립니다

nozolink가 `deleteBareSocialOrphan` + 120초 신선도 가드를 **삭제**하려 합니다.
근거는 **FK `RESTRICT`가 그 휴리스틱을 대체한다**는 것입니다 —
누가 쓰고 있으면 `DELETE`가 그냥 실패하므로, 시간으로 추측할 필요가 없어집니다.

**그 논리는 세 앱 전부에 RESTRICT가 걸려야 성립합니다.**

| 표 | 상태 |
|---|---|
| `app_nozolink.users` · `admin_users` | ✅ 적용됨 |
| `public.cw_users` · `cw_guest_accounts` | ✅ 적용됨 |
| **`app_open_vote` 과금 5개** | ⏳ **미적용 — 유일하게 남음** |

**지금 상태에서 nozolink가 가드를 지우면 open_vote 계정만 무방비가 됩니다.**
`credit_accounts` · `credit_transactions` · `point_wallets` · `point_ledger` · `api_clients`가
전부 `CASCADE`이므로, 계정 하나가 지워지면 **돈·원장·API 키가 조용히 사라집니다.**

그래서 nozolink에 **"open_vote Phase B 적용 이후에 지우라"**고 통지했습니다.
**Phase B가 그 작업의 선행 조건입니다.**

### 지금이 가장 싼 시점입니다

13개 표 **전부 0행**이라 검증 비용 0, 잠기는 계정 0, 롤백 위험 0입니다.
행이 쌓이기 시작하면 이 조건은 돌아오지 않습니다.

검증은 계획하신 대로 **카탈로그 단언**(`confdeltype = 'r'`)으로 충분합니다.
실계정 `DELETE` 검증은 하지 마십시오 — 제약이 안 걸렸을 때 그 DELETE가 성공해서
세 앱을 CASCADE로 훑습니다.

---

## 3. 유지 / 철회

| 항목 | 처리 |
|---|---|
| `signOut({scope:'local'})` 2곳 | ✅ **유지** — 완료 확인함. 테넌시와 무관하게 옳은 선택 |
| `shared-auth-guard.test.ts` (SDK명 + REST 경로) | ✅ **유지** — 부재 고정은 계속 유효 |
| `AGENTS.md` 공유 auth 절 | ✅ **유지**. 다만 §4의 문구 하나만 조정 권장 |
| Phase B RESTRICT 5개 | ✅ **진행** — §2 |
| Phase C 초대 uid 감사 로그 1줄 | ✅ 진행 |
| `core.memberships` 클레임 (초판 Phase B) | ❌ 취소 상태 유지 |

### AGENTS.md 조정 한 곳

현재 이렇게 적혀 있습니다:

> `auth.admin.unlinkIdentity` | 다른 앱의 **유일한** 로그인 수단일 수 있음.
> GoTrue 의 "신원 2개 이상" 규칙은 보호가 안 됨

Cowork 전환 후에는 **`auth.identities`의 소셜 신원이 전부 nozolink 것**이 되므로
이 문장의 근거가 약해집니다. 다만 **금지 자체는 유지하십시오** —
open_vote가 남의 신원을 뗄 이유는 여전히 없고, 테스트로 부재를 고정해 두는 것이 맞습니다.
*"다른 앱의 로그인 수단일 수 있음"* 정도로 완화하면 정확해집니다.

---

## 4. 계약 문서

3자 계약 문서 — 정본은 Cowork 리포에 있습니다:
[`cowork/docs/shared-auth-contract.md`](https://github.com/B100JY/cowork/blob/main/docs/shared-auth-contract.md) —
에서 **신원 해제 관련 조항이 축소**됩니다.
Cowork 전환 후 앱 간 신원 충돌이 사라지기 때문입니다.

**축소되지 않는 것** — open_vote가 제출한 §1·§2는 그대로 유효합니다:

- **클레임 정의 = `ON DELETE RESTRICT`가 걸린 표.** open_vote는 과금 5개.
  (nozolink의 `findExternalAccountClaims`는 그 정의를 이미 따르고 있고,
  `voter_registry`·`elections`를 제외한 것도 반영돼 있습니다 — 확인함)
- **계정 삭제 시 해제 순서**: `api_clients` → 원장 → 잔액 → 다른 앱 → 마지막에 `auth.users`
- **대시보드 금지 조항** — `auth.identities` 삭제를 막는 FK는 존재할 수 없고
  `auth.audit_log_entries`가 0행이라 사후 조사도 안 됩니다. 이건 Cowork 전환과 무관하게 남습니다
- **훅 슬롯 소유권** — Cowork가 계속 점유합니다(전환과 무관)

---

## 5. 확인 부탁

1. **Phase B RESTRICT 5개를 언제 적용하실 수 있는지** — nozolink의 가드 삭제가 여기 걸려 있습니다
2. §3의 `AGENTS.md` 문구 완화에 이견 있으신가요?
3. 분리 없음 결정에 이견 있으신가요? (핸드오프 재작업이 사라지므로 open_vote에는 이득입니다)
