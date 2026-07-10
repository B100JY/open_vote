/**
 * 연동 선거 "투표 여부(used)" 배치 조회의 순수 로직.
 * 라우트 핸들러와 테스트가 동일한 매핑을 공유하도록 DB 의존 없이 분리했습니다.
 *
 * 익명성: 여기서 다루는 값은 "이 auth user 가 이 선거 명부에 있고 투표했는가"뿐이며,
 * 표 내용/후보/기표 시각 등 비공개 정보는 절대 다루지 않습니다.
 */

export type VoterStatus = "voted" | "eligible" | "not_in_roster";

export type VoterRegistryStatusRow = {
  auth_user_id: string | null;
  has_voted: boolean | null;
};

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/** 요청 auth user id 배열을 정제(UUID 형식·중복 제거·상한)합니다. */
export function sanitizeAuthUserIds(value: unknown, max = 1000): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!UUID_RE.test(id)) continue;
    seen.add(id);
    if (seen.size >= max) break;
  }
  return Array.from(seen);
}

/**
 * 요청된 auth user 목록을 명부(voter_registry) 조회 결과에 매핑합니다.
 *  - 명부에 있고 has_voted=true → 'voted'
 *  - 명부에 있고 미투표      → 'eligible'
 *  - 명부에 없음             → 'not_in_roster'
 */
export function resolveVoterStatuses(
  authUserIds: string[],
  rows: VoterRegistryStatusRow[],
): Record<string, VoterStatus> {
  const voted = new Set<string>();
  const present = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.auth_user_id !== "string") continue;
    present.add(row.auth_user_id);
    if (row.has_voted === true) voted.add(row.auth_user_id);
  }

  const out: Record<string, VoterStatus> = {};
  for (const id of authUserIds) {
    if (typeof id !== "string" || !id) continue;
    out[id] = voted.has(id) ? "voted" : present.has(id) ? "eligible" : "not_in_roster";
  }
  return out;
}
