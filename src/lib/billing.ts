/**
 * 투표 생성 과금 정책.
 *
 * 유권자 1인당 포인트(기본 10P = 10원 상당)를 투표 생성 시점에 선불 포인트
 * 계정(credit_accounts)에서 차감합니다. 포인트는 관리자 지급(충전 확인)으로
 * 적립되며, 실제 PG 결제 연동 전까지의 선불 모델입니다.
 */

const DEFAULT_CREDIT_PER_VOTER = 10;

/** 유권자 1인당 차감 포인트. env `VOTE_CREDIT_PER_VOTER`로 조정 가능 */
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
  return voterCount * getCreditPerVoter();
}
