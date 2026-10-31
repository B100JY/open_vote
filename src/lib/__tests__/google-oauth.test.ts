import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleAuthorizeUrl,
  decodeJwtPayload,
  displayNameFrom,
  googleErrorMessage,
  identityFromClaims,
} from "../google-oauth.ts";

const CLIENT = "client-123.apps.googleusercontent.com";
const base = { iss: "https://accounts.google.com", aud: CLIENT, sub: "1001", email: "Kim@Gmail.com", email_verified: true, name: "김모아" };

test("확인된 구글 메일만 신원으로 인정", () => {
  assert.deepEqual(identityFromClaims(base, CLIENT), { sub: "1001", email: "kim@gmail.com", name: "김모아" });
  assert.equal(identityFromClaims({ ...base, email_verified: false }, CLIENT), null);
  assert.equal(identityFromClaims({ ...base, aud: "other" }, CLIENT), null);
  assert.equal(identityFromClaims({ ...base, iss: "https://evil.example" }, CLIENT), null);
  assert.equal(identityFromClaims({ ...base, sub: "" }, CLIENT), null);
});

test("이름이 없거나 짧으면 메일 앞부분으로", () => {
  assert.equal(displayNameFrom(" 홍길동 ", "a@b.c"), "홍길동");
  assert.equal(displayNameFrom(undefined, "moai@gmail.com"), "moai");
  assert.equal(displayNameFrom("A", "x@gmail.com"), "회원x");
});

test("동의 화면 주소에 state·redirect 가 들어간다", () => {
  const url = new URL(buildGoogleAuthorizeUrl(CLIENT, "https://vote.bluerdot.net/api/auth/google/callback", "st"));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(url.searchParams.get("redirect_uri"), "https://vote.bluerdot.net/api/auth/google/callback");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
});

test("JWT 본문 해석과 오류 문구", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "1" })).toString("base64url");
  assert.deepEqual(decodeJwtPayload(`h.${payload}.s`), { sub: "1" });
  assert.throws(() => decodeJwtPayload("broken"));
  assert.match(googleErrorMessage("cancelled"), /취소/);
  assert.match(googleErrorMessage("anything"), /실패/);
});
