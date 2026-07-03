import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTEMPT_WINDOW_MS,
  BLOCK_DURATION_MS,
  MAX_ATTEMPTS,
  blockStatus,
  nextFailureState,
} from "../rate-limit-window.ts";

const NOW = 1_700_000_000_000;

test("기록이 없으면 카운트 1로 시작하고 차단하지 않는다", () => {
  const next = nextFailureState(null, NOW);
  assert.equal(next.attemptCount, 1);
  assert.equal(next.blockedUntilMs, null);
});

test("시간창 내 실패는 카운트를 누적한다", () => {
  const next = nextFailureState(
    { attemptCount: 1, lastAttemptAtMs: NOW - 1000, blockedUntilMs: null },
    NOW,
  );
  assert.equal(next.attemptCount, 2);
  assert.equal(next.blockedUntilMs, null);
});

test("MAX_ATTEMPTS에 도달하면 차단한다", () => {
  const next = nextFailureState(
    {
      attemptCount: MAX_ATTEMPTS - 1,
      lastAttemptAtMs: NOW - 1000,
      blockedUntilMs: null,
    },
    NOW,
  );
  assert.equal(next.attemptCount, MAX_ATTEMPTS);
  assert.equal(next.blockedUntilMs, NOW + BLOCK_DURATION_MS);
});

test("시간창이 지나면 카운트를 초기화한다(정상 사용자 영구 차단 방지)", () => {
  const next = nextFailureState(
    {
      attemptCount: MAX_ATTEMPTS - 1,
      lastAttemptAtMs: NOW - ATTEMPT_WINDOW_MS - 1000,
      blockedUntilMs: null,
    },
    NOW,
  );
  assert.equal(next.attemptCount, 1);
  assert.equal(next.blockedUntilMs, null);
});

test("이전 차단이 만료되면 카운트와 차단을 초기화한다", () => {
  const next = nextFailureState(
    {
      attemptCount: MAX_ATTEMPTS + 3,
      lastAttemptAtMs: NOW - 1000,
      blockedUntilMs: NOW - 1000, // 이미 만료된 차단
    },
    NOW,
  );
  assert.equal(next.attemptCount, 1);
  assert.equal(next.blockedUntilMs, null);
});

test("blockStatus는 미래 차단만 차단으로 본다", () => {
  assert.deepEqual(blockStatus(null, NOW), {
    blocked: false,
    remainingSeconds: 0,
  });
  assert.deepEqual(blockStatus(NOW - 1, NOW), {
    blocked: false,
    remainingSeconds: 0,
  });

  const active = blockStatus(NOW + 30_000, NOW);
  assert.equal(active.blocked, true);
  assert.equal(active.remainingSeconds, 30);
});
