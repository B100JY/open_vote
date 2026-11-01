import { test } from "node:test";
import assert from "node:assert/strict";
import { updateContactGroupIds } from "../contact-group-membership.ts";

test("그룹을 하나 추가해도 기존 그룹은 모두 유지한다", () => {
  const original = ["조합원", "교대2조"];
  assert.deepEqual(updateContactGroupIds(original, "청주", true), ["조합원", "교대2조", "청주"]);
  assert.deepEqual(original, ["조합원", "교대2조"]);
});

test("그룹을 해제할 때 지정한 그룹만 제거한다", () => {
  assert.deepEqual(updateContactGroupIds(["조합원", "청주", "교대2조"], "청주", false), ["조합원", "교대2조"]);
});

test("중복 선택·이미 없는 그룹 해제는 다른 소속을 바꾸지 않는다", () => {
  const current = ["조합원", "교대2조"];
  assert.deepEqual(updateContactGroupIds(current, "조합원", true), current);
  assert.deepEqual(updateContactGroupIds(current, "청주", false), current);
});
