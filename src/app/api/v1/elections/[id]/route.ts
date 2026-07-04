import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-client-auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 외부 앱 연동용 선거 조회(진행률 폴링).
 * 키 소유자가 만든 선거만 조회할 수 있습니다.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateApiClient(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const { id } = await context.params;
    const supabase = getServiceSupabase();

    const { data: election, error } = await supabase
      .from("elections")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, error?.message);
    }

    if (election.created_by !== auth.client.owner_user_id) {
      return jsonError("이 선거를 조회할 권한이 없습니다.", 403, "forbidden");
    }

    const { data: stats } = await supabase.rpc("get_election_stats", {
      p_election_id: id,
    });

    return NextResponse.json({
      election: normalizeElection(election),
      stats: stats ?? null,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 정보를 불러오지 못했습니다.",
      500,
    );
  }
}
