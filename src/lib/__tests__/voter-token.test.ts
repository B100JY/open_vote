import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createVoterToken,
  hashVoterToken,
  isValidVoterTokenFormat,
} from "../voter-token.ts";

test("생성된 토큰은 URL-safe base64 형식이며 매번 다르다", () => {
  const a = createVoterToken();
  const b = createVoterToken();
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(a, b);
  assert.ok(isValidVoterTokenFormat(a));
});

test("토큰 해시는 SHA-256 hex이며 결정적이다", () => {
  const token = "AbCdEf0123456789_-abcd";
  const expected = createHash("sha256").update(token, "utf-8").digest("hex");
  assert.equal(hashVoterToken(token), expected);
  assert.equal(hashVoterToken(token), hashVoterToken(token));
  assert.match(hashVoterToken(token), /^[a-f0-9]{64}$/);
});

test("토큰 형식 검증: 길이·문자 집합을 벗어나면 거부한다", () => {
  assert.equal(isValidVoterTokenFormat("short"), false);
  assert.equal(isValidVoterTokenFormat("a".repeat(65)), false);
  assert.equal(isValidVoterTokenFormat("has space in token!!"), false);
  assert.equal(isValidVoterTokenFormat("with/slash+plus=chars22"), false);
  assert.equal(isValidVoterTokenFormat("a".repeat(22)), true);
});
