import { after } from "next/server";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export function notificationWebhook(): string | null {
  const value = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "chat.googleapis.com" && /^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) && url.searchParams.has("key") && url.searchParams.has("token") ? value : null;
  } catch { return null; }
}

/** 알림 실패가 가입·기표 응답에 영향을 주지 않도록 응답 후 처리한다. */
export function scheduleNotifications() {
  after(async () => {
    try { await deliverNotifications(); }
    catch { console.warn("관리 알림 처리 실패: 관리자 알림함에서 재시도 가능"); }
  });
}

export async function deliverNotifications(maxBatches = 20) {
  const started = Date.now();
  for (let batch = 0; batch < maxBatches && Date.now() - started < 200_000; batch++) {
    if (!await deliverBatch()) break;
    if (batch + 1 < maxBatches) await new Promise(resolve => setTimeout(resolve, 1150));
  }
}

async function deliverBatch() {
  const webhook = notificationWebhook();
  if (!webhook) return false;
  const db = getServiceDbSupabase();
  const { data, error } = await db.rpc("claim_admin_notifications");
  if (error) throw new Error("NOTIFICATION_CLAIM_FAILED");
  const items = (data ?? []) as { id: string; kind: string; title: string; attempts: number; lease_token: string }[];
  if (!items.length) return false;
  try {
    // 최대 10건을 순차 발송한다. DB 임대로 다른 인스턴스의 동시 발송도 막는다.
    for (const [index, item] of items.entries()) {
      if (index) await new Promise(resolve => setTimeout(resolve, 1100));
      const { data: settings, error: settingsError } = await db.from("notification_settings").select("*").eq("id", true).single();
      if (settingsError) throw new Error("NOTIFICATION_SETTINGS_FAILED");
      const key = item.kind === "signup" ? "signup_enabled" : item.kind === "election_created" ? "election_enabled" : "vote_enabled";
      if (!settings.enabled || !settings[key]) {
        const { error: skipError } = await db.from("admin_notifications").update({ state: "skipped", lease_until: null }).eq("id", item.id).eq("attempts", item.attempts).eq("state", "sending");
        if (skipError) throw new Error("NOTIFICATION_SKIP_FAILED");
        continue;
      }
      const label = item.kind === "signup" ? "회원 가입" : item.kind === "election_created" ? "투표 생성" : "투표 1건 접수";
      const title = item.title.replace(/[\r\n\x00-\x1f<>]/g, " ").slice(0, 120);
      const text = `[모아이투표] ${label}${item.kind === "signup" ? "" : `\n투표: ${title}`}\n알림 번호: ${item.id}\nhttps://vote.bluerdot.net/admin/notifications`;
      let success = false, failure = "DELIVERY_FAILED";
      try {
        const response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(4000), redirect: "error" });
        success = response.ok;
        failure = `HTTP_${response.status}`;
        await response.body?.cancel();
      } catch { /* URL을 포함할 수 있는 예외는 기록하지 않는다. */ }
      const { error: finishError } = await db.rpc("finish_admin_notification", { p_id: item.id, p_attempt: item.attempts, p_success: success, p_error: success ? null : failure });
      if (finishError) throw new Error("NOTIFICATION_FINISH_FAILED");
    }
  } finally {
    const { error: releaseError } = await db.rpc("release_notification_dispatch", { p_token: items[0].lease_token });
    if (releaseError) throw new Error("NOTIFICATION_RELEASE_FAILED");
  }
  return true;
}
