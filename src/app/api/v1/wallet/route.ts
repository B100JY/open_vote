import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 연동 조합 지갑 잔액 조회(서버-서버, X-Api-Key). nozolink 관리자 화면 표시용. */
export async function GET(request: Request) {
  const client = await authenticateApiClient(request);
  if (!client) {
    return jsonError("유효한 API 키가 필요합니다.", 401, "unauthorized");
  }

  const { searchParams } = new URL(request.url);
  const unionId = searchParams.get("unionId")?.trim() ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(unionId)) {
    return jsonError("연동 조합 ID가 올바르지 않습니다.", 400, "invalid_union");
  }

  const db = getServiceDbSupabase();
  const { data: wallet } = await db
    .from("union_point_wallets")
    .select("balance, updated_at")
    .eq("union_id", unionId)
    .maybeSingle();

  return NextResponse.json({
    unionId,
    balance: wallet?.balance ?? 0,
    updatedAt: wallet?.updated_at ?? null,
  });
}
