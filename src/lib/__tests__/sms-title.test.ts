import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSmsTitle, defaultSmsTitle } from "../sms-title.ts";

test("빈 제목은 기본값(null)", () => {
  assert.deepEqual(checkSmsTitle(""), { ok: true, value: null });
  assert.deepEqual(checkSmsTitle(undefined), { ok: true, value: null });
  assert.deepEqual(checkSmsTitle("  2026 대의원   선거 "), { ok: true, value: "2026 대의원 선거" });
});

test("링크·전화번호·이모지·긴 제목은 거절", () => {
  assert.equal(checkSmsTitle("투표 http://evil.example").ok, false);
  assert.equal(checkSmsTitle("bit.ly/abc 투표").ok, false);
  assert.equal(checkSmsTitle("문의 010-1234-5678").ok, false);
  assert.equal(checkSmsTitle("투표 안내 🗳").ok, false);
  assert.equal(checkSmsTitle("가".repeat(31)).ok, false);
  assert.equal(checkSmsTitle(123).ok, false);
});

test("기본 제목은 30자 이내", () => {
  assert.equal(defaultSmsTitle("대의원 선거"), "대의원 선거 투표 안내");
  assert.ok(defaultSmsTitle("가".repeat(40)).length <= 30);
});
