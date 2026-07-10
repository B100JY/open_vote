import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 특정 연동 조합(union) 지갑 잔액과 최근 원장을 조회한다(관리자 전용). */
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status, auth.error);
  }

  const { searchParams } = new URL(request.url);
  const unionId = searchParams.get("unionId")?.trim() ?? "";
  if (!/^[0-9a-fA-F-]{36}$/.test(unionId)) {
    return jsonError("연동 조합 ID가 올바르지 않습니다.", 400, "invalid_union");
  }

  const db = getServiceDbSupabase();
  const [{ data: wallet }, { data: ledger }] = await Promise.all([
    db.from("union_point_wallets").select("union_id, balance, updated_at").eq("union_id", unionId).maybeSingle(),
    db
      .from("union_point_ledger")
      .select("id, delta, balance_after, reason, memo, election_id, created_at")
      .eq("union_id", unionId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    unionId,
    balance: wallet?.balance ?? 0,
    updatedAt: wallet?.updated_at ?? null,
    ledger: ledger ?? [],
  });
}

/** 연동 조합 지갑에 포인트를 충전/차감한다(관리자 지급). */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return jsonError(auth.message, auth.status, auth.error);
  }

  const body = (await request.json()) as Record<string, unknown>;
  const unionId = typeof body.unionId === "string" ? body.unionId.trim() : "";
  const amount = Math.floor(Number(body.amount));
  const memo = typeof body.memo === "string" ? body.memo.trim() : "";

  if (!/^[0-9a-fA-F-]{36}$/.test(unionId)) {
    return jsonError("연동 조합 ID가 올바르지 않습니다.", 400, "invalid_union");
  }
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) {
    return jsonError("충전 금액이 올바르지 않습니다.", 400, "invalid_amount");
  }

  const db = getServiceDbSupabase();
  const { data, error } = await db.rpc("charge_union_points", {
    p_union_id: unionId,
    p_amount: amount,
    p_reason: amount > 0 ? "charge" : "adjustment",
    p_actor: auth.user.user.id,
    p_memo: memo || null,
  });

  if (error) {
    return jsonError("포인트 처리 중 오류가 발생했습니다.", 500, error.message);
  }

  const result = data as { success?: boolean; error?: string; message?: string; balance?: number } | null;
  if (!result?.success) {
    return jsonError(result?.message ?? "포인트 처리에 실패했습니다.", 400, result?.error);
  }

  return NextResponse.json({ success: true, balance: result.balance ?? null });
}
