import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOTER_CODE_ALPHABET,
  createVoterCode,
  formatVoterCode,
  hashVoterCode,
  normalizeVoterCode,
} from "../voter-code.ts";

test("코드는 헷갈리는 글자 없이 6자", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = createVoterCode();
    assert.equal(code.length, 6);
    for (const ch of code) assert.ok(VOTER_CODE_ALPHABET.includes(ch));
    assert.doesNotMatch(code, /[01OI]/);
  }
});

test("입력 정규화: 대소문자·공백·하이픈 무시, 형식 틀리면 null", () => {
  assert.equal(normalizeVoterCode(" abc-234 "), "ABC234");
  assert.equal(normalizeVoterCode("ABC 234"), "ABC234");
  assert.equal(normalizeVoterCode("ABC23"), null);
  assert.equal(normalizeVoterCode("ABC2340"), null);
  assert.equal(normalizeVoterCode("ABO234"), null);
  assert.equal(normalizeVoterCode(123456), null);
});

test("표시 형식과 HMAC", () => {
  assert.equal(formatVoterCode("ABC234"), "ABC-234");
  const pepper = "p".repeat(32);
  const hash = hashVoterCode("ABC234", pepper);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, hashVoterCode("ABC234", pepper));
  assert.notEqual(hash, hashVoterCode("ABC234", "q".repeat(32)));
});
