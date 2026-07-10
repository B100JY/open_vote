import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 연동 선거를 종료(closed)한다(서버-서버, X-Api-Key).
 * nozolink 연동 선거(nozolink_union_id 있음)만 대상으로 하며, 이미 종료면 idempotent.
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
  const { data: election, error } = await db
    .from("elections")
    .select("id, status, nozolink_union_id")
    .eq("id", electionId)
    .maybeSingle<{ id: string; status: string; nozolink_union_id: string | null }>();

  if (error || !election) {
    return jsonError("선거 정보를 찾을 수 없습니다.", 404, "election_not_found");
  }

  // 연동 선거만 이 경로로 종료할 수 있다(openvote 자체 선거 보호).
  if (!election.nozolink_union_id) {
    return jsonError("이 선거는 연동 선거가 아닙니다.", 403, "not_integration_election");
  }

  if (election.status === "closed") {
    return NextResponse.json({ ok: true, election: { id: electionId, status: "closed" } });
  }

  const { error: updateError } = await db
    .from("elections")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", electionId);

  if (updateError) {
    return jsonError("투표 종료 중 오류가 발생했습니다.", 500, updateError.message);
  }

  await db.from("audit_logs").insert({
    event_type: "external_election_closed",
    election_id: electionId,
    details: { union_id: election.nozolink_union_id, via: "api_client", actor: client.owner_user_id },
  });

  return NextResponse.json({ ok: true, election: { id: electionId, status: "closed" } });
}
