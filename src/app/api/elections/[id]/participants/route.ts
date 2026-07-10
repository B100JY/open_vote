import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const { id } = await context.params;
    const supabase = getServiceSupabase();

    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("id, name, created_by")
      .eq("id", id)
      .maybeSingle();

    if (electionError || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    if (!canManageElection(auth, election.created_by)) {
      return jsonError("이 선거의 유권자 명부를 볼 권한이 없습니다.", 403, "forbidden");
    }

    const { data, error } = await supabase
      .from("voter_registry")
      .select(
        "id, election_id, user_id, email, phone, voter_name, has_voted, invited_at, voted_at, created_at, updated_at",
      )
      .eq("election_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonError("유권자 명부를 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({
      election: { id: election.id, name: election.name },
      voters: data ?? [],
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "유권자 명부를 불러오지 못했습니다.",
      500,
    );
  }
}
