import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLedgerHash, createReceiptHash, normalizeReceiptInput, verifyLedger } from "../verification.ts";
import { formatReceiptForCopy } from "../vote-receipt.ts";

const ELECTION_ID = "11111111-1111-1111-1111-111111111111";

test("완료 화면에서 복사한 영수증을 그대로 검색할 수 있다(줄바꿈 제거 포함)", () => {
  const receipt = { electionId: ELECTION_ID, electionName: "시험", receiptHash: "a".repeat(64), salt: "b".repeat(64) };
  const copied = formatReceiptForCopy(receipt);
  assert.equal(normalizeReceiptInput(copied), receipt.receiptHash);
  assert.equal(normalizeReceiptInput(copied.replaceAll("\n", "")), receipt.receiptHash);
  assert.equal(normalizeReceiptInput(copied.replaceAll("\n", "\r\n")), receipt.receiptHash);
});

test("해시만 입력하거나 대문자·0x 접두사를 붙인 검색도 지원한다", () => {
  assert.equal(normalizeReceiptInput(` 0x${"A".repeat(64)} `), "a".repeat(64));
  assert.equal(normalizeReceiptInput("a".repeat(64)), "a".repeat(64));
});

test("잘못된 형식과 서로 다른 영수증을 함께 붙인 입력은 검색하지 않는다", () => {
  for (const value of ["", "잘못된 값", "a".repeat(63), "a".repeat(65), `receipt_hash=${"a".repeat(65)}`, `salt=${"a".repeat(64)}`]) {
    assert.equal(normalizeReceiptInput(value), "");
  }
  assert.equal(normalizeReceiptInput(`receipt_hash=${"a".repeat(64)}\nreceipt_hash=${"b".repeat(64)}`), "");
});

// DB get_public_ballot_ledger 와 같은 식으로 로컬 Postgres 에서 계산한 값(2026-10-10).
// 이 값이 바뀌면 브라우저 검증과 DB 공개 원장이 서로 어긋난 것이다.
const SQL_VECTOR = {
  ballots: [
    { receipt_hash: "b".repeat(64), selection: "a,b" },
    { receipt_hash: "a".repeat(64), selection: "BLANK" },
    { receipt_hash: `${"0".repeat(63)}f`, selection: "c>a" },
    { receipt_hash: "c".repeat(64), selection: "a:yes,b:no" },
  ],
  ledgerHash: "869bec449bb3a96dab8fdb0a278c9250b1a66e9bd2a344077f9afa524b351d21",
};

test("원장 해시는 DB 계산값과 같다(입력 순서와 무관)", async () => {
  assert.equal(await computeLedgerHash(SQL_VECTOR.ballots), SQL_VECTOR.ledgerHash);
  assert.equal(await computeLedgerHash([...SQL_VECTOR.ballots].reverse()), SQL_VECTOR.ledgerHash);
});

test("정상 원장은 검증을 통과한다", async () => {
  const result = await verifyLedger(SQL_VECTOR.ballots, SQL_VECTOR.ledgerHash);
  assert.equal(result.valid, true);
});

test("선택 내용이 바뀌면 원장 검증이 실패한다", async () => {
  const tampered = SQL_VECTOR.ballots.map((ballot, index) =>
    index === 0 ? { ...ballot, selection: "a" } : ballot,
  );
  const result = await verifyLedger(tampered, SQL_VECTOR.ledgerHash);
  assert.equal(result.valid, false);
});

test("표가 빠지면 원장 검증이 실패한다", async () => {
  const result = await verifyLedger(SQL_VECTOR.ballots.slice(1), SQL_VECTOR.ledgerHash);
  assert.equal(result.valid, false);
});

test("같은 영수증이 두 번 있으면 실패한다", async () => {
  const doubled = [...SQL_VECTOR.ballots, SQL_VECTOR.ballots[0]];
  const result = await verifyLedger(doubled, await computeLedgerHash(doubled));
  assert.equal(result.valid, false);
});

test("createReceiptHash는 같은 입력에 대해 결정적이고 선택이 다르면 달라진다", async () => {
  const salt = "f".repeat(64);
  const a = await createReceiptHash({ electionId: ELECTION_ID, selection: "a,b", salt });
  const b = await createReceiptHash({ electionId: ELECTION_ID, selection: "a,b", salt });
  const c = await createReceiptHash({ electionId: ELECTION_ID, selection: "a", salt });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});
