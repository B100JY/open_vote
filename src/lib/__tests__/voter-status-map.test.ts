import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVoterStatuses, sanitizeAuthUserIds } from "../voter-status-map.ts";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

test("투표한 유권자는 voted", () => {
  const out = resolveVoterStatuses([A], [{ auth_user_id: A, has_voted: true }]);
  assert.equal(out[A], "voted");
});

test("명부에 있으나 미투표는 eligible", () => {
  const out = resolveVoterStatuses([A], [{ auth_user_id: A, has_voted: false }]);
  assert.equal(out[A], "eligible");
});

test("명부에 없으면 not_in_roster", () => {
  const out = resolveVoterStatuses([C], [{ auth_user_id: A, has_voted: true }]);
  assert.equal(out[C], "not_in_roster");
});

test("배치 조회: 각각 독립적으로 매핑", () => {
  const out = resolveVoterStatuses(
    [A, B, C],
    [
      { auth_user_id: A, has_voted: true },
      { auth_user_id: B, has_voted: false },
    ],
  );
  assert.deepEqual(out, { [A]: "voted", [B]: "eligible", [C]: "not_in_roster" });
});

test("null/이상 행은 무시", () => {
  const out = resolveVoterStatuses(
    [A],
    [{ auth_user_id: null, has_voted: true }] as never,
  );
  assert.equal(out[A], "not_in_roster");
});

test("sanitizeAuthUserIds: UUID 형식만 통과·중복 제거", () => {
  assert.deepEqual(sanitizeAuthUserIds([A, A, "not-a-uuid", 123, B]), [A, B]);
});

test("sanitizeAuthUserIds: 배열 아님 → 빈 배열", () => {
  assert.deepEqual(sanitizeAuthUserIds("nope"), []);
  assert.deepEqual(sanitizeAuthUserIds(null), []);
});

test("sanitizeAuthUserIds: 상한 적용", () => {
  const many = Array.from({ length: 10 }, (_, i) => `${i}`.padStart(8, "0") + "-0000-0000-0000-000000000000");
  assert.equal(sanitizeAuthUserIds(many, 3).length, 3);
});
