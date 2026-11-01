/** 시작과 마감은 동일할 수 없으며, 마감은 항상 시작보다 늦어야 합니다. */
export function electionPeriodError(startsAt: Date, endsAt: Date): string | null {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return "투표 시작 및 마감 일시를 확인해주세요.";
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return "투표 마감 일시는 시작 일시보다 늦어야 합니다.";
  }
  return null;
}
