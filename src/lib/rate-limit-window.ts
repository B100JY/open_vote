// 레이트리밋의 순수 결정 로직. DB 접근(rate-limit.ts)과 분리해 단위 테스트가
// 가능하도록 합니다.

export const MAX_ATTEMPTS = 5;
export const BLOCK_DURATION_MS = 15 * 60 * 1000;
// 마지막 실패 이후 이 시간이 지나면 시도 카운트를 초기화합니다(시간창).
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type RateLimitSnapshot = {
  attemptCount: number;
  lastAttemptAtMs: number | null;
  blockedUntilMs: number | null;
};

export type RateLimitDecision = {
  attemptCount: number;
  lastAttemptAtMs: number;
  blockedUntilMs: number | null;
};

/**
 * 현재 차단 상태를 계산합니다. 차단 만료 시각이 미래일 때만 차단으로 봅니다.
 */
export function blockStatus(
  blockedUntilMs: number | null,
  nowMs: number,
): { blocked: boolean; remainingSeconds: number } {
  if (!blockedUntilMs || blockedUntilMs <= nowMs) {
    return { blocked: false, remainingSeconds: 0 };
  }

  return {
    blocked: true,
    remainingSeconds: Math.ceil((blockedUntilMs - nowMs) / 1000),
  };
}

/**
 * 실패가 한 번 더 기록될 때 저장해야 할 다음 상태를 계산합니다.
 *
 * - 기존 기록이 없으면 카운트 1로 시작합니다.
 * - 마지막 시도가 시간창을 벗어났거나 이전 차단이 만료됐으면 카운트를 초기화합니다
 *   (정상 사용자가 영구 차단되지 않도록).
 * - 누적 시도가 MAX_ATTEMPTS 이상이면 BLOCK_DURATION_MS 동안 차단합니다.
 */
export function nextFailureState(
  previous: RateLimitSnapshot | null,
  nowMs: number,
): RateLimitDecision {
  if (!previous) {
    return { attemptCount: 1, lastAttemptAtMs: nowMs, blockedUntilMs: null };
  }

  const lastAttempt = previous.lastAttemptAtMs ?? 0;
  const blockedUntil = previous.blockedUntilMs ?? 0;

  const windowExpired = nowMs - lastAttempt > ATTEMPT_WINDOW_MS;
  const blockExpired = blockedUntil > 0 && blockedUntil <= nowMs;

  const baseCount = windowExpired || blockExpired ? 0 : previous.attemptCount;
  const attemptCount = baseCount + 1;
  const shouldBlock = attemptCount >= MAX_ATTEMPTS;

  return {
    attemptCount,
    lastAttemptAtMs: nowMs,
    blockedUntilMs: shouldBlock
      ? nowMs + BLOCK_DURATION_MS
      : blockExpired
        ? null
        : previous.blockedUntilMs,
  };
}
