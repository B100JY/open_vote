import crypto from "node:crypto";

/**
 * nozolink ↔ openvote 핸드오프 컨텍스트 서명/검증.
 *
 * nozolink가 서명한 `state`(조합 컨텍스트)를 openvote가 같은 비밀키로 검증한다.
 * 두 앱은 반드시 동일한 `OPENVOTE_HANDOFF_SECRET` 값을 공유해야 한다.
 *
 * 형식: base64url(payloadJSON) + "." + hex(HMAC_SHA256(payloadJSON, secret))
 * payload: { u: unionId, n?: unionName, a?: actorUserId, p: purpose, exp: unixSeconds }
 */

export type HandoffPurpose = "admin_create" | "member_vote";

export type HandoffContext = {
  unionId: string;
  unionName?: string;
  actorUserId?: string;
  purpose: HandoffPurpose;
  electionId?: string;
  exp: number;
};

type RawPayload = {
  u: string;
  n?: string;
  a?: string;
  p: HandoffPurpose;
  e?: string;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.OPENVOTE_HANDOFF_SECRET;
  if (!secret) {
    throw new Error("OPENVOTE_HANDOFF_SECRET is not configured.");
  }
  return secret;
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function signHandoffState(context: HandoffContext): string {
  const payload: RawPayload = {
    u: context.unionId,
    p: context.purpose,
    exp: context.exp,
  };
  if (context.unionName) payload.n = context.unionName;
  if (context.actorUserId) payload.a = context.actorUserId;
  if (context.electionId) payload.e = context.electionId;

  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const body = base64url(json);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("hex");
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; context: HandoffContext }
  | { ok: false; error: string };

export function verifyHandoffState(state: string | null | undefined): VerifyResult {
  if (!state || typeof state !== "string" || !state.includes(".")) {
    return { ok: false, error: "missing_state" };
  }

  const [body, sig] = state.split(".");
  if (!body || !sig) {
    return { ok: false, error: "malformed_state" };
  }

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("hex");

  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, error: "bad_signature" };
  }

  let payload: RawPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8")) as RawPayload;
  } catch {
    return { ok: false, error: "malformed_payload" };
  }

  if (!payload.u || !payload.p || !payload.exp) {
    return { ok: false, error: "incomplete_payload" };
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "expired" };
  }

  return {
    ok: true,
    context: {
      unionId: payload.u,
      unionName: payload.n,
      actorUserId: payload.a,
      purpose: payload.p,
      electionId: payload.e,
      exp: payload.exp,
    },
  };
}
