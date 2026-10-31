import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { auditReceiptEvidence, electionContextHash, makeAuditRecord, parseReceiptFile, withCheckpoint } from "../receipt-audit.ts";
import { createReceiptHtml } from "../receipt-file.ts";
import { computeLedgerHash, createReceiptHash } from "../verification.ts";
import { parseSavedReceipt, receiptLabel, type SavedReceipt } from "../vote-receipt.ts";
import type { Election } from "../types.ts";

const election: Election = { id: "11111111-1111-1111-1111-111111111111", name: "시험 선거", description: null,
  candidates: [{ id: "a", name: "첫 항목" }, { id: "b", name: "둘째 항목" }], ballot_type: "single",
  min_choices: 1, max_choices: 1, allow_blank: true, status: "closed", total_voter_codes: 2,
  starts_at: null, ends_at: null, created_at: "", updated_at: "" };

async function fixture() {
  const salt = "a".repeat(64);
  const receiptHash = await createReceiptHash({ electionId: election.id, selection: "a", salt });
  const receipt: SavedReceipt = { electionId: election.id, electionName: election.name, salt, receiptHash, contextHash: await electionContextHash(election) };
  const ballots = [{ receipt_hash: receiptHash, selection: "a" }, { receipt_hash: "b".repeat(64), selection: "b" }];
  const record = makeAuditRecord(election, { election_id: election.id, ballots, ballot_count: ballots.length, ledger_hash: await computeLedgerHash(ballots) });
  return { receipt, record };
}

test("최초 영수증은 내 표·투표 항목을 확인하고 마감 기준값을 보관한다", async () => {
  const { receipt, record } = await fixture();
  const result = await auditReceiptEvidence(receipt, record);
  assert.equal(result.valid, true);
  const sealed = withCheckpoint(receipt, result);
  assert.equal(sealed.checkpoint?.ledgerHash, record.ledger.ledger_hash);
  assert.equal((await auditReceiptEvidence(sealed, record)).valid, true);
  assert.deepEqual(parseSavedReceipt(JSON.stringify(sealed)), sealed);
});

test("서버가 내 선택과 전체 도장을 함께 바꿔도 개인 영수증 대조는 실패한다", async () => {
  const { receipt, record } = await fixture();
  record.ledger.ballots[0].selection = "b";
  record.ledger.ledger_hash = await computeLedgerHash(record.ledger.ballots);
  const result = await auditReceiptEvidence(receipt, record);
  assert.equal(result.valid, false);
  assert.match(result.message, /선택 내용/);
});

test("내 표 누락·중복과 개수 불일치, 다른 선거와 진행중 기록을 거부한다", async () => {
  const { receipt, record } = await fixture();
  for (const mode of ["missing", "duplicate", "count", "wrong-election", "active"] as const) {
    const bad = structuredClone(record);
    if (mode === "missing") { bad.ledger.ballots.shift(); bad.ledger.ballot_count--; }
    if (mode === "duplicate") { bad.ledger.ballots.push(bad.ledger.ballots[0]); bad.ledger.ballot_count++; }
    if (mode === "count") bad.ledger.ballot_count++;
    if (mode === "wrong-election") bad.election.id = "22222222-2222-2222-2222-222222222222";
    if (mode === "active") Object.assign(bad.election, { status: "active" });
    bad.ledger.ledger_hash = await computeLedgerHash(bad.ledger.ballots);
    assert.equal((await auditReceiptEvidence(receipt, bad)).valid, false, mode);
  }
});

test("마감 기준값 보관 후 다른 표의 변경·삭제·추가와 도장 동시 변경도 검출한다", async () => {
  const { receipt, record } = await fixture();
  const sealed = withCheckpoint(receipt, await auditReceiptEvidence(receipt, record));
  for (const mode of ["change", "remove", "add"]) {
    const bad = structuredClone(record);
    if (mode === "change") bad.ledger.ballots[1].selection = "a";
    if (mode === "remove") bad.ledger.ballots.pop();
    if (mode === "add") bad.ledger.ballots.push({ receipt_hash: "c".repeat(64), selection: "a" });
    bad.ledger.ballot_count = bad.ledger.ballots.length;
    bad.ledger.ledger_hash = await computeLedgerHash(bad.ledger.ballots);
    assert.equal((await auditReceiptEvidence(sealed, bad)).valid, false, mode);
    // 최초 전체 기준값이 없으면 다른 사람의 표 변경까지 보증하지 않는다는 한계도 고정한다.
    assert.equal((await auditReceiptEvidence(receipt, bad)).valid, true, mode);
  }
});

test("후보 ID가 같아도 이름·설명·규칙 변경은 투표 당시 기준값과 어긋난다", async () => {
  const { receipt, record } = await fixture();
  for (const mutate of [
    (e: typeof record.election) => { e.candidates[0].name = "바뀐 항목"; },
    (e: typeof record.election) => { e.name = "바뀐 제목"; },
    (e: typeof record.election) => { e.allow_blank = false; },
    (e: typeof record.election) => { e.description = "바뀐 설명"; },
  ]) {
    const bad = structuredClone(record); mutate(bad.election);
    assert.equal((await auditReceiptEvidence(receipt, bad)).valid, false);
  }
  const reordered = structuredClone(record);
  reordered.election.candidates = reordered.election.candidates.map(c => ({ name: c.name, id: c.id, description: undefined }));
  assert.equal((await auditReceiptEvidence(receipt, reordered)).valid, true);
});

test("기존 영수증은 내 표 검증으로 호환하고 기존 마감 기준값은 다른 값으로 덮어쓰지 않는다", async () => {
  const { receipt, record } = await fixture();
  const legacy = { ...receipt }; delete legacy.contextHash;
  assert.equal((await auditReceiptEvidence(legacy, record)).valid, true);
  const result = await auditReceiptEvidence(receipt, record);
  assert.throws(() => withCheckpoint(receipt, { valid: false, message: "실패" }));
  assert.throws(() => withCheckpoint(withCheckpoint(receipt, result), { ...result, ledgerHash: "f".repeat(64) }));
  for (const checkpoint of [{}, { ledgerHash: "a".repeat(64), contextHash: "b".repeat(64), ballotCount: -1 }, null]) {
    assert.equal(parseSavedReceipt(JSON.stringify({ ...receipt, checkpoint })), null);
  }
});

test("독립 HTML 영수증은 서버 연결 없이 동일한 검증 엔진을 실행하고 스크립트 삽입을 막는다", async () => {
  const { receipt, record } = await fixture();
  receipt.electionName = '</script><script>throw Error("삽입")</script>';
  const html = createReceiptHtml(receipt);
  assert.deepEqual(parseReceiptFile(html), receipt);
  assert.ok(html.includes("connect-src 'none'"));
  assert.equal(html.includes(receipt.electionName), false);
  assert.equal(receiptLabel(receipt).replaceAll("-", "").length, 12);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  // HTML 자체의 전체 JS를 네트워크 API 없는 환경에 실행한다.
  const elements = new Map<string, { textContent: string; addEventListener: () => void }>();
  const document = { getElementById(id: string) {
    if (!elements.has(id)) elements.set(id, { textContent: id === "moai-receipt" ? JSON.stringify(receipt) : "", addEventListener() {} });
    return elements.get(id);
  } };
  const offline = runInNewContext(`${scripts[0][1]}; audit`, { document, crypto: webcrypto, TextEncoder, Uint8Array, setTimeout });
  assert.equal((await offline(receipt, record)).valid, true);
  record.ledger.ballots[0].selection = "b";
  record.ledger.ledger_hash = await computeLedgerHash(record.ledger.ballots);
  assert.equal((await offline(receipt, record)).valid, false);
});
