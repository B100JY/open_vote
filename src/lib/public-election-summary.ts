export type PublicElectionSummary = {
  id: string;
  name: string;
  organization_name?: string;
  content_restricted?: boolean;
  status?: "active" | "closed" | "scheduled";
  starts_at?: string | null;
  ends_at?: string | null;
  audience_label?: string;
  deadline_label?: string;
  participation_rate?: number | null;
};

export function deadlineLabel(endsAt: string | null, now: number): string {
  if (!endsAt) return "마감일 미정";
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return "마감일 미정";
  const remaining = end - now;
  if (remaining <= 0) return "마감";
  if (remaining >= 86_400_000) return `마감까지 ${Math.floor(remaining / 86_400_000)}일`;
  if (remaining >= 3_600_000) return `마감까지 ${Math.ceil(remaining / 3_600_000)}시간`;
  return `마감까지 ${Math.ceil(remaining / 60_000)}분`;
}

/** 공개 카드용 허용 목록. 설명·후보·명부 정보는 응답에 복사하지 않는다. */
export function publicElectionSummary(
  election: { id: string; name: string; organization_name?: string; ends_at: string | null; starts_at?: string | null; auth_mode?: string | null; status?: string; closed_at?: string | null; content_restricted?: boolean },
  stats: unknown,
  now: number,
): PublicElectionSummary {
  const status = election.status === "closed" ? "closed" : election.starts_at && Date.parse(election.starts_at) > now ? "scheduled" : "active";
  const basic = {
    id: election.id, name: election.name, status: status as "active" | "closed" | "scheduled",
    ...(election.organization_name ? {organization_name:election.organization_name} : {}),
    starts_at: election.starts_at ?? null, ends_at: election.ends_at,
    audience_label: election.auth_mode === "member_session" ? "명부에 등록된 회원" : "명부에 등록된 유권자",
    deadline_label: status === "closed" ? "투표 종료" : status === "scheduled" ? "시작 예정" : deadlineLabel(election.ends_at, now),
  };
  if (election.content_restricted !== false) return {...basic,content_restricted:true};
  const raw = stats && typeof stats === "object" && "progress" in stats ? stats.progress : null;
  const progress = typeof raw === "number" || (typeof raw === "string" && raw.trim()) ? Number(raw) : NaN;
  return {
    ...basic,
    participation_rate: Number.isFinite(progress) && progress >= 0 && progress <= 100 ? progress : null,
  };
}

/** 공개 카드의 기간은 기기 시간대와 무관하게 한국 시각으로 표시한다. */
export function publicPeriodDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "미정";
  return new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
}
