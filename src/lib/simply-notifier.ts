import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * simply-notifier(공용 SMS/알림톡 발송 서버) 호출 클라이언트.
 *
 * - 모든 요청은 HMAC-SHA256 서명(X-App-Id/X-Timestamp/X-Nonce/X-Signature)이 필요합니다.
 * - 서명에 사용한 바디 바이트를 재직렬화 없이 그대로 전송해야 합니다(서버가 바이트 단위로 검증).
 * - 알림 본문은 notifier 서버에 등록된 템플릿만 사용할 수 있고, 호출 앱은 수신자별
 *   `{변수}` 값만 채웁니다. 이 앱의 투표 안내 템플릿은 `{name}`, `{url}` 변수를 사용합니다.
 * - `api_secret`은 서버 환경 변수로만 보관합니다(클라이언트 번들 금지).
 */

export type NotifierRecipient = {
  phone: string;
  /** 결과(results[].ref)에 그대로 echo되는 호출 앱 식별자 (여기서는 voter_registry.id) */
  ref?: string;
  variables: Record<string, string>;
};

export type NotifierRecipientResult = {
  ref: string | null;
  phone: string;
  status: "sent" | "failed" | "error" | "skipped" | "preview";
  channel?: string;
  provider?: string;
  message_id?: string | null;
  reason?: string | null;
};

export type NotifierBatchResponse = {
  batch_id: string;
  template_id?: string;
  channel?: string;
  requested: number;
  sent: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  results: NotifierRecipientResult[];
};

export class SimplyNotifierError extends Error {
  status: number;
  code: string;
  detail: unknown;

  constructor(status: number, payload: unknown) {
    const err =
      payload && typeof payload === "object" && "error" in payload
        ? ((payload as { error: unknown }).error as {
            code?: string;
            message?: string;
          })
        : {};
    super(`[simply-notifier ${status}] ${err?.code ?? "unknown"}: ${err?.message ?? ""}`);
    this.status = status;
    this.code = err?.code ?? "unknown";
    this.detail = err;
  }
}

export type NotifierConfig = {
  baseUrl: string;
  appId: string;
  apiSecret: string;
  template: string;
};

export function getNotifierConfig(): NotifierConfig | null {
  const baseUrl =
    process.env.SIMPLY_NOTIFIER_BASE_URL ?? "https://notifier.bluerdot.net";
  const appId = process.env.SIMPLY_NOTIFIER_APP_ID ?? "";
  const apiSecret = process.env.SIMPLY_NOTIFIER_API_SECRET ?? "";
  const template = process.env.SIMPLY_NOTIFIER_TEMPLATE ?? "투표안내";

  if (!appId || !apiSecret) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), appId, apiSecret, template };
}

/** canonical = METHOD \n PATH(쿼리 포함) \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY) */
export function signNotifierRequest({
  method,
  path,
  timestamp,
  nonce,
  body,
  apiSecret,
}: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: Uint8Array;
  apiSecret: string;
}) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = [method.toUpperCase(), path, timestamp, nonce, bodyHash].join("\n");
  return createHmac("sha256", apiSecret).update(canonical).digest("hex");
}

async function notifierRequest<T>(
  config: NotifierConfig,
  method: string,
  path: string,
  payload: unknown,
  options?: { idempotencyKey?: string; timeoutMs?: number },
): Promise<T> {
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID().replace(/-/g, "");
  const signature = signNotifierRequest({
    method,
    path,
    timestamp,
    nonce,
    body,
    apiSecret: config.apiSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Id": config.appId,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
  if (options?.idempotencyKey) {
    headers["X-Idempotency-Key"] = options.idempotencyKey;
  }

  const response = await fetch(config.baseUrl + path, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(options?.timeoutMs ?? 30_000),
  });

  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new SimplyNotifierError(response.status, data);
  }
  return data;
}

/**
 * 개인화 알림(대량) 발송 — POST /v1/notifications
 *
 * 수신자별 부분 실패(변수 오류·잘못된 번호)는 해당 수신자만 건너뛰고 계속되지만,
 * 수신번호 중복과 일일 한도 초과는 배치 전체가 거부됩니다(SimplyNotifierError).
 */
export function sendNotifierBatch(
  config: NotifierConfig,
  {
    recipients,
    dryRun = false,
    idempotencyKey,
  }: {
    recipients: NotifierRecipient[];
    dryRun?: boolean;
    idempotencyKey?: string;
  },
): Promise<NotifierBatchResponse> {
  return notifierRequest<NotifierBatchResponse>(
    config,
    "POST",
    "/v1/notifications",
    {
      template: config.template,
      dry_run: dryRun,
      recipients,
    },
    { idempotencyKey, timeoutMs: 60_000 },
  );
}
