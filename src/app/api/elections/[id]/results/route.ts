import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();

    const [{ data: election, error: electionError }, { data: results, error }] =
      await Promise.all([
        supabase.from("elections").select("*").eq("id", id).single(),
        supabase.rpc("get_vote_results", { p_election_id: id }),
      ]);

    if (electionError || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    if (error) {
      return jsonError("투표 결과를 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({
      election: normalizeElection(election),
      results,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 결과를 불러오지 못했습니다.",
      500,
    );
  }
}
