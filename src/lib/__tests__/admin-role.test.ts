import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdminUser } from "../admin-role.ts";

test("로그인하지 않은(null) 사용자는 관리자가 아니다", () => {
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser(undefined), false);
});

test("app_metadata.role이 admin이면 관리자다", () => {
  assert.equal(isAdminUser({ app_metadata: { role: "admin" } }), true);
});

test("app_metadata.roles 배열에 admin이 있으면 관리자다", () => {
  assert.equal(
    isAdminUser({ app_metadata: { roles: ["user", "admin"] } }),
    true,
  );
});

test("admin이 아닌 역할은 거부된다", () => {
  assert.equal(isAdminUser({ app_metadata: { role: "user" } }), false);
  assert.equal(isAdminUser({ app_metadata: { roles: ["viewer"] } }), false);
  assert.equal(isAdminUser({ app_metadata: {} }), false);
});

test("user_metadata의 role은 권한 상승에 사용되지 않는다", () => {
  // app_metadata만 신뢰한다. user_metadata는 사용자가 직접 바꿀 수 있으므로 무시.
  const user = {
    app_metadata: {},
    user_metadata: { role: "admin" },
  } as Parameters<typeof isAdminUser>[0];
  assert.equal(isAdminUser(user), false);
});
