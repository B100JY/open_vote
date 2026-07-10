import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENVOTE_HANDOFF_SECRET = "test-secret-openvote";

import { signHandoffState, verifyHandoffState } from "../handoff.ts";

const now = () => Math.floor(Date.now() / 1000);

test("valid handoff state round-trips", () => {
  const state = signHandoffState({
    unionId: "u-123",
    purpose: "member_vote",
    electionId: "e-9",
    exp: now() + 300,
  });
  const result = verifyHandoffState(state);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.context.unionId, "u-123");
    assert.equal(result.context.electionId, "e-9");
    assert.equal(result.context.purpose, "member_vote");
  }
});

test("tampered body is rejected", () => {
  const state = signHandoffState({ unionId: "u", purpose: "admin_create", exp: now() + 300 });
  const [body, sig] = state.split(".");
  const tampered = `${body.slice(0, -2)}XX.${sig}`;
  assert.equal(verifyHandoffState(tampered).ok, false);
});

test("bad signature is rejected", () => {
  const state = signHandoffState({ unionId: "u", purpose: "admin_create", exp: now() + 300 });
  const [body] = state.split(".");
  assert.equal(verifyHandoffState(`${body}.${"0".repeat(64)}`).ok, false);
});

test("expired state is rejected", () => {
  const state = signHandoffState({ unionId: "u", purpose: "member_vote", exp: now() - 1 });
  const result = verifyHandoffState(state);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "expired");
});

test("missing state is rejected", () => {
  assert.equal(verifyHandoffState("").ok, false);
  assert.equal(verifyHandoffState(null).ok, false);
  assert.equal(verifyHandoffState("nodot").ok, false);
});
