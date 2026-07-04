import { test } from "node:test";
import assert from "node:assert/strict";
import { getCreditPerVoter, voteCreationCost } from "../billing.ts";

test("기본 단가는 10P/인이다", () => {
  delete process.env.VOTE_CREDIT_PER_VOTER;
  assert.equal(getCreditPerVoter(), 10);
  assert.equal(voteCreationCost(100), 1000);
});

test("환경 변수로 단가를 조정할 수 있다", () => {
  process.env.VOTE_CREDIT_PER_VOTER = "15";
  assert.equal(getCreditPerVoter(), 15);
  assert.equal(voteCreationCost(3), 45);
  delete process.env.VOTE_CREDIT_PER_VOTER;
});

test("잘못된 환경 변수 값은 기본값으로 폴백한다", () => {
  process.env.VOTE_CREDIT_PER_VOTER = "-1";
  assert.equal(getCreditPerVoter(), 10);
  process.env.VOTE_CREDIT_PER_VOTER = "abc";
  assert.equal(getCreditPerVoter(), 10);
  delete process.env.VOTE_CREDIT_PER_VOTER;
});

test("유권자 수가 0 이하이거나 정수가 아니면 비용은 0이다", () => {
  delete process.env.VOTE_CREDIT_PER_VOTER;
  assert.equal(voteCreationCost(0), 0);
  assert.equal(voteCreationCost(-5), 0);
  assert.equal(voteCreationCost(1.5), 0);
});
