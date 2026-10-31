/**
 * 문자 발송 요율. 투표 생성 자체는 무료다.
 *
 * 발송 직전에 전체 비용을 예약하고 성공분은 사용, 확정 실패분은 반환한다.
 */

const DEFAULT_CREDIT_PER_VOTER = 30;

/** 기존 안내 문자 단가. 이전 환경변수 이름은 호환을 위해 유지한다. */
export function getCreditPerVoter(): number {
  const raw = Number(process.env.VOTE_CREDIT_PER_VOTER);
  if (Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  return DEFAULT_CREDIT_PER_VOTER;
}

export function voteCreationCost(voterCount: number): number {
  if (!Number.isInteger(voterCount) || voterCount <= 0) {
    return 0;
  }
  return 0;
}

/** 간편 SMS 단가. */
export function getSmsPrices() {
  const raw = Number(process.env.VOTE_COMPACT_SMS_PRICE ?? 10);
  return { standard: getCreditPerVoter(), compact: Number.isInteger(raw) && raw >= 0 ? raw : 10 };
}
