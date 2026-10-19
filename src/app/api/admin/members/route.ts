import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { data, error } = await getServiceDbSupabase()
    .from("members").select("id, email, display_name, role, email_verified, created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "회원 목록 조회에 실패했습니다." }, { status: 500 });
  return NextResponse.json({ members: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
