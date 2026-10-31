import test from "node:test";
import assert from "node:assert/strict";
import { makeViewToken, validViewToken, VIEW_TTL_SECONDS } from "../election-view-token.ts";
test("열람 권한은 선거·서명키·만료 시각에 묶이며 변조와 다른 선거에서 거부된다", () => {
  const secret="synthetic-secret-for-view-test",now=Date.parse("2026-10-30T00:00:00Z");
  const token=makeViewToken("election-a",secret,now);
  assert.ok(validViewToken(token,"election-a",secret,now));
  assert.equal(validViewToken(token,"election-b",secret,now),false);
  assert.equal(validViewToken(token,"election-a","another-secret",now),false);
  assert.equal(validViewToken(token,"election-a",secret,now+VIEW_TTL_SECONDS*1000),false);
  assert.equal(validViewToken(token.replace(/^\d/,"9"),"election-a",secret,now),false);
  for(const bad of ["",token+"00","election-a", "9999999999.bad"]) assert.equal(validViewToken(bad,"election-a",secret,now),false);
});
