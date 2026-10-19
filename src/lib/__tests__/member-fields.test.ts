import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSignupEmail, normalizeDisplayName, validateSignupPassword, syntheticAccountEmail, acceptsRegistrationCode,
} from "../member-fields.ts";

test("이메일 정규화와 기본 검증", () => {
  assert.equal(normalizeSignupEmail("  UnionK25@Gmail.Com "), "unionk25@gmail.com");
  assert.equal(normalizeSignupEmail("bad address"), null);
  assert.equal(normalizeSignupEmail("missing@"), null);
  assert.equal(normalizeSignupEmail(null), null);
});

test("암호 최소 12자 및 길이 제한", () => {
  assert.equal(validateSignupPassword("123456789012"), true);
  assert.equal(validateSignupPassword("12345678901"), false);
  assert.equal(validateSignupPassword("A".repeat(129)), false);
  assert.equal(validateSignupPassword(123), false);
});

test("실명 입력과 계정 별도 신원 보호", () => {
  assert.equal(normalizeDisplayName(" 홍길동 "), "홍길동");
  assert.equal(normalizeDisplayName("a"), null);
  const one = syntheticAccountEmail();
  const two = syntheticAccountEmail();
  assert.match(one, /^u[0-9a-f]{32}@member\.openvote\.invalid$/);
  assert.notEqual(one, two);
  assert.notEqual(one, "unionk25@gmail.com");
});

test("초대코드 없이는 공개 회원가입이 불가능", () => {
  assert.equal(acceptsRegistrationCode("strong-secret-123456", undefined), false);
  assert.equal(acceptsRegistrationCode("strong-secret-123456", "short"), false);
  assert.equal(acceptsRegistrationCode("strong-secret-123456", "strong-secret-123456"), true);
  assert.equal(acceptsRegistrationCode("strong-secret-123457", "strong-secret-123456"), false);
  assert.equal(acceptsRegistrationCode(null, "strong-secret-123456"), false);
});
