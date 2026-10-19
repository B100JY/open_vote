import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 개표 결과. 투표가 종료(closed)된 선거만 반환한다 — 진행 중 중간 결과는
 * 관리자에게도 보이지 않는다(DB 함수 get_election_results 가 한 번 더 막는다).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();
    await supabase.rpc("close_expired_elections");

    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (electionError || !election || (election.status !== "active" && election.status !== "closed")) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    if (election.status !== "closed") {
      return NextResponse.json({
        election: normalizeElection(election),
        results: null,
        message: "결과는 투표가 종료된 뒤 공개됩니다.",
      });
    }

    const { data, error } = await supabase.rpc("get_election_results", { p_election_id: id });
    const results = data as { success?: boolean; message?: string } | null;

    if (error || !results?.success) {
      return jsonError(results?.message ?? "투표 결과를 불러오지 못했습니다.", 500, error?.message);
    }

    return NextResponse.json({ election: normalizeElection(election), results });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 결과를 불러오지 못했습니다.",
      500,
    );
  }
}
