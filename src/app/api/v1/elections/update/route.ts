import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { normalizeCandidates } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 연동 선거 수정(서버-서버, X-Api-Key). 투표수 0건일 때만 허용.
 * body: { electionId, name?, description?, candidates?, startsAt?, endsAt? }
 *  - 미제공 필드는 변경하지 않는다(부분 갱신).
 *  - candidates 제공 시 후보를 교체한다(0표일 때만 도달, id 재생성).
 *  - 이미 표가 있으면 RPC 가 { success:false, error:'has_votes' } 로 거부한다.
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

  const name = typeof body.name === "string" ? body.name.trim() : null;
  const description =
    typeof body.description === "string" ? body.description : body.description === null ? "" : null;
  const candidates =
    body.candidates !== undefined && body.candidates !== null ? normalizeCandidates(body.candidates) : null;
  if (candidates !== null && candidates.length === 0) {
    return jsonError("최소 한 개 이상의 투표 항목을 등록해주세요.", 400, "invalid_request");
  }

  const startsAt =
    typeof body.startsAt === "string" && !Number.isNaN(Date.parse(body.startsAt))
      ? new Date(body.startsAt).toISOString()
      : null;
  const endsAt =
    typeof body.endsAt === "string" && !Number.isNaN(Date.parse(body.endsAt))
      ? new Date(body.endsAt).toISOString()
      : null;

  const db = getServiceDbSupabase();
  const { data: rpcResult, error: rpcError } = await db.rpc("update_integration_election", {
    p_election_id: electionId,
    p_name: name,
    p_description: description,
    p_candidates: candidates,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (rpcError) {
    return jsonError("투표 수정 중 오류가 발생했습니다.", 500, rpcError.message);
  }

  const result = rpcResult as
    | { success?: boolean; error?: string; message?: string; voter_count?: number; cast_count?: number }
    | null;

  if (!result?.success) {
    const error = result?.error ?? "update_failed";
    const status = error === "has_votes" ? 409 : error === "not_integration_election" ? 403 : error === "election_not_found" ? 404 : 400;
    return NextResponse.json(
      {
        success: false,
        error,
        message: result?.message ?? "투표를 수정하지 못했습니다.",
        cast_count: typeof result?.cast_count === "number" ? result.cast_count : undefined,
      },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    election: { id: electionId },
    voter_count: result.voter_count ?? 0,
    cast_count: result.cast_count ?? 0,
  });
}
