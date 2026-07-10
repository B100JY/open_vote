import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 연동 선거 삭제(서버-서버, X-Api-Key). 투표수 0건일 때만 허용.
 * body: { electionId }
 *  - sms_token 으로 이미 차감된 선불 포인트가 있으면 조합 지갑으로 환불(원자적).
 *  - 이미 표가 있으면 RPC 가 { success:false, error:'has_votes' } 로 거부한다.
 * 응답: { success:true, refunded, voter_count, cast_count }
 */
export async function POST(request: Request) {
  const client = await authenticateApiClient(request);
  if (!client) {
    return jsonError("유효한 API 키가 필요합니다.", 401, "unauthorized");
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const electionId = typeof body.electionId === "string" ? body.electionId.trim() : "";
  if (!/^[0-9a-fA-F-]{36}$/.test(electionId)) {
    return jsonError("선거 ID가 올바르지 않습니다.", 400, "invalid_election");
  }

  const db = getServiceDbSupabase();
  const { data: rpcResult, error: rpcError } = await db.rpc("delete_integration_election", {
    p_election_id: electionId,
    p_actor: client.owner_user_id,
  });

  if (rpcError) {
    return jsonError("투표 삭제 중 오류가 발생했습니다.", 500, rpcError.message);
  }

  const result = rpcResult as
    | { success?: boolean; error?: string; message?: string; refunded?: number; voter_count?: number; cast_count?: number }
    | null;

  if (!result?.success) {
    const error = result?.error ?? "delete_failed";
    const status = error === "has_votes" ? 409 : error === "not_integration_election" ? 403 : error === "election_not_found" ? 404 : 400;
    return NextResponse.json(
      {
        success: false,
        error,
        message: result?.message ?? "투표를 삭제하지 못했습니다.",
        cast_count: typeof result?.cast_count === "number" ? result.cast_count : undefined,
      },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    refunded: result.refunded ?? 0,
    voter_count: result.voter_count ?? 0,
    cast_count: result.cast_count ?? 0,
  });
}
