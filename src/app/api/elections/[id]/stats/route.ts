import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("get_election_stats", {
      p_election_id: id,
    });

    if (error) {
      return jsonError("선거 통계를 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({ stats: data });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 통계를 불러오지 못했습니다.",
      500,
    );
  }
}
