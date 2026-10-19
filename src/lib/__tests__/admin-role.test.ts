import { test } from "node:test";
import assert from "node:assert/strict";
import { canAdministrate, canCreateElection } from "../admin-role.ts";

test("OpenVote role이 없거나 승인 대기면 관리 기능을 사용할 수 없다", () => {
  assert.equal(canAdministrate(null), false);
  assert.equal(canCreateElection(undefined), false);
  assert.equal(canCreateElection("pending"), false);
  assert.equal(canAdministrate("suspended"), false);
});

test("생성자는 자기 선거 생성만 가능하고 admin은 전체 관리 가능", () => {
  assert.equal(canCreateElection("creator"), true);
  assert.equal(canAdministrate("creator"), false);
  assert.equal(canCreateElection("admin"), true);
  assert.equal(canAdministrate("admin"), true);
});

test("공용 JWT에 role이라는 문자열이 있어도 단독으로 권한을 생성하지 않는다", () => {
  const foreignJwt = { app_metadata: { role: "admin" } };
  assert.equal(canAdministrate(undefined), false);
  assert.ok(foreignJwt.app_metadata.role);
});
