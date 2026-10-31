import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSavedReceipt } from "../vote-receipt.ts";

const saved = {
  electionId: "11111111-1111-1111-1111-111111111111",
  electionName: "시험 선거",
  receiptHash: "a".repeat(64),
  salt: "b".repeat(64),
};

test("정상 저장 영수증을 읽고 선택 내용 등 불필요한 값은 표시 모델에서 제외한다", () => {
  assert.deepEqual(parseSavedReceipt(JSON.stringify({ ...saved, selection: "비공개" })), saved);
});

test("영수증이 없거나 손상된 경우 완료 증거로 사용하지 않는다", () => {
  for (const raw of [null, "", "{", "null", "[]", "true", "{}", JSON.stringify({ electionName: "시험" })]) {
    assert.equal(parseSavedReceipt(raw), null);
  }
  for (const invalid of [
    { ...saved, electionId: "잘못된 선거" },
    { ...saved, receiptHash: "a".repeat(63) },
    { ...saved, receiptHash: 42 },
    { ...saved, salt: null },
  ]) {
    assert.equal(parseSavedReceipt(JSON.stringify(invalid)), null);
  }
});

test("선거명이 없는 이전 영수증도 필수 식별값이 정상이면 읽는다", () => {
  const legacy = { ...saved, electionName: undefined };
  assert.deepEqual(parseSavedReceipt(JSON.stringify(legacy)), { ...saved, electionName: "" });
});
