/**
 * 투표 번호와 검색.
 * 투표 번호는 따로 저장하지 않고 선거 id(uuid) 앞 8자리를 대문자로 보여 준다. 사람이 불러 주고 받아 적기 좋은 길이다.
 */
export function electionNumber(id: string): string {
  return id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

export function matchesElectionQuery(election: { id: string; name: string }, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const compact = text.replace(/[\s-]/g, "");
  if (/^[0-9a-f]{4,}$/.test(compact) && election.id.replaceAll("-", "").toLowerCase().startsWith(compact)) {
    return true;
  }
  return election.name.toLowerCase().includes(text);
}

/** 주소의 ?election= 값이 목록에 있으면 그것을, 없으면 첫 투표를 고른다(진행률·결과·검증 화면 공용). */
export function pickElectionId(elections: Array<{ id: string }>, search: string): string {
  const wanted = new URLSearchParams(search).get("election");
  return elections.find((election) => election.id === wanted)?.id ?? elections[0]?.id ?? "";
}
