import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { signNotifierRequest } from "../simply-notifier.ts";

// simply-notifier 매뉴얼의 서명 규칙:
// canonical = METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY)
// X-Signature = HMAC_SHA256_HEX(api_secret, canonical)
test("HMAC 서명이 레퍼런스 구현(node_client)과 동일하게 계산된다", () => {
  const secret = "smsk_test_secret";
  const body = Buffer.from(
    JSON.stringify({
      template: "투표안내",
      dry_run: true,
      recipients: [{ phone: "010-1111-2222", ref: "voter-1", variables: { name: "홍길동", url: "https://v.kr/1" } }],
    }),
    "utf-8",
  );
  const timestamp = "1751700000";
  const nonce = "0123456789abcdef0123456789abcdef";

  const expectedCanonical = [
    "POST",
    "/v1/notifications",
    timestamp,
    nonce,
    createHash("sha256").update(body).digest("hex"),
  ].join("\n");
  const expected = createHmac("sha256", secret)
    .update(expectedCanonical)
    .digest("hex");

  const actual = signNotifierRequest({
    method: "post",
    path: "/v1/notifications",
    timestamp,
    nonce,
    body,
    apiSecret: secret,
  });

  assert.equal(actual, expected);
  assert.match(actual, /^[a-f0-9]{64}$/);
});

test("서명은 바디 바이트에 민감하다 (재직렬화 감지)", () => {
  const base = {
    method: "POST",
    path: "/v1/notifications",
    timestamp: "1751700000",
    nonce: "n1",
    apiSecret: "secret",
  };
  const a = signNotifierRequest({ ...base, body: Buffer.from('{"a":1}') });
  const b = signNotifierRequest({ ...base, body: Buffer.from('{"a": 1}') });
  assert.notEqual(a, b);
});

test("쿼리스트링이 다르면 서명이 달라진다", () => {
  const base = {
    method: "GET",
    timestamp: "1751700000",
    nonce: "n1",
    body: Buffer.from(""),
    apiSecret: "secret",
  };
  const a = signNotifierRequest({ ...base, path: "/v1/notifications/abc" });
  const b = signNotifierRequest({ ...base, path: "/v1/notifications/abc?x=1" });
  assert.notEqual(a, b);
});
