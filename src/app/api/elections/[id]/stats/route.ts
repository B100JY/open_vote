import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireElectionView } from "@/lib/election-view-access";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const denied = await requireElectionView(request, id);
    if (denied) return denied;
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("get_election_stats", {
      p_election_id: id,
    });

    if (error) {
      return jsonError("선거 통계를 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({ stats: data },{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 통계를 불러오지 못했습니다.",
      500,
    );
  }
}
