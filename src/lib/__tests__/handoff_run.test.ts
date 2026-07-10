import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENVOTE_HANDOFF_SECRET = "test-secret-openvote";

const { signHandoffState, verifyHandoffState } = await import("../handoff.ts");

const now = () => Math.floor(Date.now() / 1000);

test("handoff: valid round-trips, tamper/expiry rejected", () => {
  const state = signHandoffState({ unionId: "u-1", purpose: "member_vote", electionId: "e-9", exp: now() + 300 });
  const ok = verifyHandoffState(state);
  assert.equal(ok.ok, true);

  const [body, sig] = state.split(".");
  assert.equal(verifyHandoffState(`${body.slice(0, -2)}XX.${sig}`).ok, false);
  assert.equal(verifyHandoffState(`${body}.${"0".repeat(64)}`).ok, false);
  assert.equal(verifyHandoffState(signHandoffState({ unionId: "u", purpose: "member_vote", exp: now() - 1 })).ok, false);
});
