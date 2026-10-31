import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceDbSupabase } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    received = request.headers.get("authorization") ?? "";
  if (!secret)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const expected = `Bearer ${secret}`;
  if (
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  scheduleNotifications();
  const { data, error } = await getServiceDbSupabase().rpc("workspace_purge", {
    p_limit: 25,
  });
  return error
    ? NextResponse.json({ error: "purge_failed" }, { status: 503 })
    : NextResponse.json(
        { purged: data },
        { headers: { "Cache-Control": "no-store" } },
      );
}
import { scheduleNotifications } from "@/lib/admin-notifications";
