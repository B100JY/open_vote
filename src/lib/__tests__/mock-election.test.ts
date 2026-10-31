import test from "node:test";
import assert from "node:assert/strict";
import { mockElectionResults } from "../mock-election.ts";
import { recount, type Manifest } from "../native-audit.ts";
import type { Election, PublicLedgerBallot } from "../types.ts";

const original: Election = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "테스트", description: null,
  candidates: [{id:"a",name:"A"},{id:"b",name:"B"},{id:"c",name:"C"}],
  ballot_type: "single", min_choices: 1, max_choices: 1, allow_blank: true,
  total_voter_codes: 0, status: "closed", starts_at: null, ends_at: null,
  created_at: "", updated_at: "",
};
const votes = (...selections: string[]): PublicLedgerBallot[] => selections.map((selection,i)=>({selection,receipt_hash:String(i).padStart(64,"0")}));
test("모의 단일 선택과 기권 집계", () => {
  const result = mockElectionResults(original, votes("a", "b", "a", "BLANK"));
  assert.equal(result.total_ballots,4);
  assert.equal(result.valid_ballots,3);
  assert.equal(result.blank_ballots,1);
  assert.deepEqual(result.candidates.map(c=>c.votes),[2,1,0]);
  assert.deepEqual(result.candidates.map(c=>c.percentage),[66.67,33.33,0]);
});
test("모의 연기명은 유효표당 각 항목의 득표율을 집계한다", () => {
  const result = mockElectionResults({...original,ballot_type:"multi",max_choices:2},votes("a,b","b,c","BLANK"));
  assert.deepEqual(result.candidates.map(c=>c.votes),[1,2,1]);
  assert.deepEqual(result.candidates.map(c=>c.percentage),[50,100,50]);
});
test("모의 찬반은 항목별 찬성률을 계산한다", () => {
  const result = mockElectionResults({...original,ballot_type:"approve"}, votes("a:yes,b:no,c:yes","a:no,b:no,c:yes","BLANK"));
  assert.deepEqual(result.candidates.map(c=>c.yes),[1,0,2]);
  assert.deepEqual(result.candidates.map(c=>c.no),[1,2,0]);
  assert.deepEqual(result.candidates.map(c=>c.yes_percentage),[50,0,100]);
});
test("모의 순위별 횟수와 점수", () => {
  const result = mockElectionResults({...original,ballot_type:"rank",max_choices:3},votes("a>b>c","c>a>b","BLANK"));
  assert.deepEqual(result.candidates.map(c=>c.rank_counts),[[1,1,0],[0,1,1],[1,0,1]]);
  assert.deepEqual(result.candidates.map(c=>c.points),[5,3,4]);
  assert.deepEqual(result.candidates.map(c=>c.percentage),[50,0,50]);
});

test("모든 투표 방식의 모의 집계는 실제 공개 원장 독립 재집계와 일치한다", () => {
  const examples = [
    { type: "single" as const, count: 1, data: votes("a","b","BLANK") },
    { type: "multi" as const, count: 2, data: votes("a,b","b,c","BLANK") },
    { type: "approve" as const, count: 1, data: votes("a:yes,b:no,c:yes","a:no,b:no,c:yes","BLANK") },
    { type: "rank" as const, count: 3, data: votes("a>b","b>a","BLANK") },
  ];
  for (const example of examples) {
    const e = { ...original, ballot_type: example.type, max_choices: example.count };
    const manifest = { election: e } as unknown as Manifest;
    assert.deepEqual(mockElectionResults(e,example.data),recount(manifest,example.data),example.type);
  }
});
