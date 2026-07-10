import crypto from "node:crypto";

/**
 * Simply-Notifier(https://notifier.bluerdot.net) 개인화 알림(SMS) 클라이언트.
 *
 * sms_token 방식 선거에서 유권자별 1회용 투표 링크를 문자로 발송한다.
 * 본문은 서버 템플릿(기본 "투표안내") 고정이며, 호출 앱은 변수 값만 채운다.
 * 모든 /v1/* 요청은 HMAC-SHA256 서명(method\npath\nts\nnonce\nsha256hex(body))으로 인증한다.
 *
 * 환경 변수(서버 전용):
 *  - SIMPLY_NOTIFIER_APP_ID      → X-App-Id
 *  - SIMPLY_NOTIFIER_API_SECRET  → HMAC 키
 *  - SIMPLY_NOTIFIER_BASE_URL    → 기본 https://notifier.bluerdot.net
 *  - SIMPLY_NOTIFIER_TEMPLATE    → 기본 "투표안내"
 *  - SIMPLY_NOTIFIER_DRY_RUN     → "true"면 실제 발송 없이 렌더 미리보기
 *  - VOTE_LINK_BASE_URL          → 투표 링크 도메인(기본 https://openvote.bluerdot.net)
 */

const DEFAULT_BASE_URL = "https://notifier.bluerdot.net";
const DEFAULT_TEMPLATE = "투표안내";

function baseUrl() {
  return (process.env.SIMPLY_NOTIFIER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function isNotifierConfigured() {
  return Boolean(
    process.env.SIMPLY_NOTIFIER_APP_ID && process.env.SIMPLY_NOTIFIER_API_SECRET,
  );
}

export function voteLinkBaseUrl() {
  return (
    process.env.VOTE_LINK_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://openvote.bluerdot.net"
  ).replace(/\/+$/, "");
}

export function toKoreanLocalPhone(phoneRaw: string) {
  const digits = phoneRaw.replace(/\D/g, "");
  const local = digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
  if (local.length === 11) return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return local;
}

function signRequest(method: string, path: string, body: string) {
  const appId = process.env.SIMPLY_NOTIFIER_APP_ID || "";
  const apiSecret = process.env.SIMPLY_NOTIFIER_API_SECRET || "";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  const canonical = [method, path, timestamp, nonce, bodyHash].join("\n");
  const signature = crypto.createHmac("sha256", apiSecret).update(canonical).digest("hex");
  return {
    "X-App-Id": appId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
    "Content-Type": "application/json",
  };
}

export type VoteSmsTarget = {
  registryId: string;
  phone: string;
  token: string;
  name: string;
};

export type SendVoteLinksResult =
  | { ok: true; batchId: string; requested: number; sent: number; failed: number; skipped: number }
  | { ok: false; error: string; rateLimited?: boolean; retryAfter?: number };

/**
 * 유권자별 투표 링크 문자를 일괄 발송한다.
 * 템플릿 변수: { name, url }. (템플릿이 요구하는 변수와 정확히 일치해야 함)
 */
export async function sendVoteLinks(
  targets: VoteSmsTarget[],
  options?: { dryRun?: boolean; idempotencyKey?: string },
): Promise<SendVoteLinksResult> {
  if (!isNotifierConfigured()) {
    return { ok: false, error: "SMS 발송 설정(SIMPLY_NOTIFIER_*)이 없습니다." };
  }
  if (targets.length === 0) {
    return { ok: true, batchId: "", requested: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const template = process.env.SIMPLY_NOTIFIER_TEMPLATE || DEFAULT_TEMPLATE;
  const linkBase = voteLinkBaseUrl();
  const path = "/v1/notifications";
  const payload = {
    template,
    dry_run: options?.dryRun ?? process.env.SIMPLY_NOTIFIER_DRY_RUN === "true",
    recipients: targets.map((t) => ({
      phone: toKoreanLocalPhone(t.phone),
      ref: t.registryId,
      variables: {
        name: t.name || "조합원",
        url: `${linkBase}/v/${t.token}`,
      },
    })),
  };

  const body = JSON.stringify(payload);
  const extraHeaders: Record<string, string> = options?.idempotencyKey
    ? { "X-Idempotency-Key": options.idempotencyKey }
    : {};

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { ...signRequest("POST", path, body), ...extraHeaders },
      body,
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // non-JSON body
    }

    if (response.status === 429) {
      const err = (data.error && typeof data.error === "object" ? data.error : {}) as Record<string, unknown>;
      const retryAfter = Number(err.retry_after ?? response.headers.get("retry-after") ?? 60);
      return { ok: false, error: "발송 한도를 초과했습니다.", rateLimited: true, retryAfter: Math.floor(retryAfter) || 60 };
    }

    if (!response.ok) {
      const err = (data.error && typeof data.error === "object" ? data.error : {}) as Record<string, unknown>;
      const message = typeof err.message === "string" ? err.message : "문자 발송에 실패했습니다.";
      return { ok: false, error: message };
    }

    return {
      ok: true,
      batchId: typeof data.batch_id === "string" ? data.batch_id : "",
      requested: Number(data.requested ?? targets.length),
      sent: Number(data.sent ?? 0),
      failed: Number(data.failed ?? 0),
      skipped: Number(data.skipped ?? 0),
    };
  } catch (error) {
    console.error("notifier sendVoteLinks error:", error);
    return { ok: false, error: "SMS 서버에 연결할 수 없습니다." };
  }
}
