import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { resolveVoterStatuses, sanitizeAuthUserIds } from "@/lib/voter-status-map";

export const dynamic = "force-dynamic";

/**
 * 연동 선거 "투표 여부(used)" 배치 조회(서버-서버, X-Api-Key).
 * body: { electionId, authUserIds: string[] }
 * 응답: { statuses: { [authUserId]: 'voted' | 'eligible' | 'not_in_roster' } }
 *
 * 익명성: voter_registry 의 has_voted(투표 여부)만 조회하며, 이는 표 내용과 비연결이다.
 * 표/후보/기표 시각 등 비공개 정보는 반환하지 않는다.
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

  const authUserIds = sanitizeAuthUserIds(body.authUserIds);
  if (authUserIds.length === 0) {
    return NextResponse.json({ statuses: {} });
  }

  const db = getServiceDbSupabase();

  // 연동 선거인지 확인(연동 선거에 한해서만 동작).
  const { data: election, error: electionError } = await db
    .from("elections")
    .select("id, nozolink_union_id")
    .eq("id", electionId)
    .maybeSingle<{ id: string; nozolink_union_id: string | null }>();

  if (electionError || !election) {
    return jsonError("선거 정보를 찾을 수 없습니다.", 404, "election_not_found");
  }
  if (!election.nozolink_union_id) {
    return jsonError("이 선거는 연동 선거가 아닙니다.", 403, "not_integration_election");
  }

  const { data: rows, error: rowsError } = await db
    .from("voter_registry")
    .select("auth_user_id, has_voted")
    .eq("election_id", electionId)
    .in("auth_user_id", authUserIds);

  if (rowsError) {
    return jsonError("투표 여부 조회 중 오류가 발생했습니다.", 500, rowsError.message);
  }

  const statuses = resolveVoterStatuses(
    authUserIds,
    (rows ?? []) as Array<{ auth_user_id: string | null; has_voted: boolean | null }>,
  );

  return NextResponse.json({ statuses });
}
