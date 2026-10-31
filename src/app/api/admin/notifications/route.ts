import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { notificationWebhook, scheduleNotifications } from "@/lib/admin-notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const keys = ["enabled", "signup_enabled", "election_enabled", "vote_enabled"] as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  const offset = Math.max(0, Math.min(10000, Number(new URL(request.url).searchParams.get("offset")) || 0));
  const db = getServiceDbSupabase();
  const [settings, events] = await Promise.all([
    db.from("notification_settings").select("*").eq("id", true).single(),
    db.from("admin_notifications").select("id,kind,title,state,created_at,sent_at,attempts,last_error").order("created_at", { ascending: false }).order("id").range(offset, offset + 49),
  ]);
  if (settings.error || events.error) return json({ error: "알림 목록을 불러오지 못했습니다." }, 500);
  return json({ settings: settings.data, events: events.data, webhookConfigured: Boolean(notificationWebhook()) });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !keys.includes(key as typeof keys[number]) || typeof body[key] !== "boolean") || !Object.keys(body).length) return json({ error: "설정을 확인해주세요." }, 400);
  const { error } = await getServiceDbSupabase().from("notification_settings").update(body).eq("id", true);
  if (error) return json({ error: "알림 설정 저장에 실패했습니다." }, 500);
  scheduleNotifications();
  return json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return json({ error: auth.message }, auth.status);
  scheduleNotifications();
  return json({ success: true });
}
