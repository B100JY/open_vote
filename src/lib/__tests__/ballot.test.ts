import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBallotRules, describeSelection, normalizeSelection } from "../ballot.ts";
import type { BallotRules } from "../types.ts";

const candidates = [
  { id: "a", name: "가" },
  { id: "b", name: "나" },
  { id: "c", name: "다" },
];

const rules = (ballot_type: BallotRules["ballot_type"], min = 1, max = 1, allow_blank = false): BallotRules => ({
  ballot_type,
  min_choices: min,
  max_choices: max,
  allow_blank,
});

function canonical(result: ReturnType<typeof normalizeSelection>) {
  assert.equal(result.ok, true, result.ok ? "" : result.message);
  return result.ok ? result.canonical : "";
}

function error(result: ReturnType<typeof normalizeSelection>) {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.error;
}

// 아래 기대값은 DB normalize_ballot_selection 결과와 같다(로컬 Postgres 시나리오로 확인).

test("single: 하나만 고를 수 있다", () => {
  assert.equal(canonical(normalizeSelection(candidates, rules("single"), { choices: ["b"] })), "b");
  assert.equal(error(normalizeSelection(candidates, rules("single"), { choices: ["a", "b"] })), "choice_count");
  assert.equal(error(normalizeSelection(candidates, rules("single"), { choices: ["z"] })), "invalid_candidate");
  assert.equal(error(normalizeSelection(candidates, rules("single"), { choices: [] })), "empty_selection");
});

test("multi: 후보 등록 순서로 정규화하고 개수 범위를 지킨다", () => {
  const multi = rules("multi", 1, 2);
  assert.equal(canonical(normalizeSelection(candidates, multi, { choices: ["c", "a"] })), "a,c");
  assert.equal(error(normalizeSelection(candidates, multi, { choices: ["a", "b", "c"] })), "choice_count");
  assert.equal(error(normalizeSelection(candidates, multi, { choices: ["a", "a"] })), "duplicate_choice");
});

test("rank: 고른 순서를 그대로 쓴다", () => {
  const rank = rules("rank", 2, 3);
  assert.equal(canonical(normalizeSelection(candidates, rank, { choices: ["c", "a", "b"] })), "c>a>b");
  assert.equal(error(normalizeSelection(candidates, rank, { choices: ["a"] })), "choice_count");
});

test("approve: 모든 항목에 찬성/반대가 있어야 한다", () => {
  const approve = rules("approve");
  assert.equal(
    canonical(normalizeSelection(candidates, approve, { approvals: { c: "no", a: "yes", b: "no" } })),
    "a:yes,b:no,c:no",
  );
  assert.equal(
    error(normalizeSelection(candidates, approve, { approvals: { a: "yes", b: "no" } })),
    "incomplete_selection",
  );
  assert.equal(
    error(normalizeSelection(candidates, approve, { approvals: { a: "yes", b: "no", c: "yes", z: "no" } })),
    "invalid_candidate",
  );
});

test("기권은 허용된 선거에서만 된다", () => {
  assert.equal(canonical(normalizeSelection(candidates, rules("single", 1, 1, true), { blank: true })), "BLANK");
  assert.equal(error(normalizeSelection(candidates, rules("multi", 1, 2), { blank: true })), "blank_not_allowed");
});

test("형식이 틀린 입력은 거부한다", () => {
  assert.equal(error(normalizeSelection(candidates, rules("single"), null)), "invalid_selection");
  assert.equal(error(normalizeSelection(candidates, rules("single"), ["a"])), "invalid_selection");
  assert.equal(error(normalizeSelection(candidates, rules("single"), { choices: [1] })), "invalid_selection");
});

test("describeSelection: 정규 문자열을 이름으로 풀어 쓴다", () => {
  assert.equal(describeSelection("a,c", candidates), "가, 다");
  assert.equal(describeSelection("c>a", candidates), "1. 다  2. 가");
  assert.equal(describeSelection("a:yes,b:no", candidates), "가 찬성, 나 반대");
  assert.equal(describeSelection("BLANK", candidates), "기권");
});

test("cleanBallotRules: 방식별로 선택 개수를 고정·검증한다", () => {
  assert.deepEqual(cleanBallotRules({ ballotType: "approve", maxChoices: 5 }, 3), {
    ok: true,
    rules: { ballot_type: "approve", min_choices: 1, max_choices: 1, allow_blank: false },
  });
  assert.equal(cleanBallotRules({ ballotType: "multi", minChoices: 1, maxChoices: 4 }, 3).ok, false);
  assert.equal(cleanBallotRules({ ballotType: "multi", minChoices: 3, maxChoices: 2 }, 3).ok, false);
  assert.equal(cleanBallotRules({ ballotType: "weird" }, 3).ok, false);
  assert.deepEqual(cleanBallotRules({}, 3), {
    ok: true,
    rules: { ballot_type: "single", min_choices: 1, max_choices: 1, allow_blank: false },
  });
});
