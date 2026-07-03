import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseChainHash,
  createReceiptHash,
  verifyLedgerChain,
} from "../verification.ts";

type Ballot = {
  sequence_number: number;
  selected_candidate: string;
  receipt_hash: string;
  previous_chain_hash: string | null;
  chain_hash: string;
};

const ELECTION_ID = "11111111-1111-1111-1111-111111111111";

async function buildBallot(
  seq: number,
  candidate: string,
  receipt: string,
  previous: string | null,
): Promise<Ballot> {
  const ballot: Ballot = {
    sequence_number: seq,
    selected_candidate: candidate,
    receipt_hash: receipt,
    previous_chain_hash: previous,
    chain_hash: "",
  };
  ballot.chain_hash = await createDatabaseChainHash(ELECTION_ID, ballot);
  return ballot;
}

async function buildValidChain(): Promise<Ballot[]> {
  const b1 = await buildBallot(1, "candidate_1", "a".repeat(64), null);
  const b2 = await buildBallot(2, "candidate_2", "b".repeat(64), b1.chain_hash);
  const b3 = await buildBallot(3, "candidate_1", "c".repeat(64), b2.chain_hash);
  return [b1, b2, b3];
}

test("정상 해시 체인은 검증을 통과한다", async () => {
  const ballots = await buildValidChain();
  const result = await verifyLedgerChain(ELECTION_ID, ballots);
  assert.equal(result.valid, true);
  assert.equal(result.brokenAt, null);
});

test("chain_hash가 변조되면(후보 변경) 검증이 실패한다", async () => {
  const ballots = await buildValidChain();
  // 저장된 chain_hash는 그대로 두고 선택 항목만 바꾸면 재계산 값이 달라진다.
  ballots[1].selected_candidate = "candidate_tampered";

  const result = await verifyLedgerChain(ELECTION_ID, ballots);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 2);
  assert.equal(result.reason, "chain_hash 불일치");
});

test("previous_chain_hash 연결이 끊기면 검증이 실패한다", async () => {
  const ballots = await buildValidChain();
  ballots[2].previous_chain_hash = "deadbeef";

  const result = await verifyLedgerChain(ELECTION_ID, ballots);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAt, 3);
  assert.equal(result.reason, "previous_chain_hash 불일치");
});

test("electionId가 다르면 같은 표라도 다른 chain_hash가 나온다", async () => {
  const ballot = {
    sequence_number: 1,
    selected_candidate: "candidate_1",
    receipt_hash: "a".repeat(64),
    previous_chain_hash: null,
    chain_hash: "",
  };
  const hashA = await createDatabaseChainHash(ELECTION_ID, ballot);
  const hashB = await createDatabaseChainHash(
    "22222222-2222-2222-2222-222222222222",
    ballot,
  );
  assert.notEqual(hashA, hashB);
});

test("createReceiptHash는 같은 입력에 대해 결정적이다", async () => {
  const a = await createReceiptHash({
    electionId: ELECTION_ID,
    selectedCandidate: "candidate_1",
    salt: "f".repeat(64),
  });
  const b = await createReceiptHash({
    electionId: ELECTION_ID,
    selectedCandidate: "candidate_1",
    salt: "f".repeat(64),
  });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});
