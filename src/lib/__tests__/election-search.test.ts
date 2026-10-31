import { test } from "node:test";
import assert from "node:assert/strict";
import { electionNumber, matchesElectionQuery, pickElectionId } from "../election-search.ts";

const election = { id: "3f2a9c1b-4d5e-4f60-8a7b-0c1d2e3f4a5b", name: "2026 대의원 선거" };

test("투표 번호는 id 앞 8자리 대문자", () => {
  assert.equal(electionNumber(election.id), "3F2A9C1B");
});

test("번호(대소문자·공백 무시)나 이름 일부로 찾는다", () => {
  assert.equal(matchesElectionQuery(election, "3F2A 9C1B"), true);
  assert.equal(matchesElectionQuery(election, "3f2a"), true);
  assert.equal(matchesElectionQuery(election, "대의원"), true);
  assert.equal(matchesElectionQuery(election, "  "), true);
  assert.equal(matchesElectionQuery(election, "9c1b"), false);
  assert.equal(matchesElectionQuery(election, "조합장"), false);
});

test("주소의 election 값을 먼저 고른다", () => {
  const list = [{ id: "a" }, { id: "b" }];
  assert.equal(pickElectionId(list, "?election=b"), "b");
  assert.equal(pickElectionId(list, "?election=zzz"), "a");
  assert.equal(pickElectionId(list, ""), "a");
  assert.equal(pickElectionId([], "?election=b"), "");
});
