import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 공개 원장(영수증 해시 + 선택 내용, 영수증 해시순). 종료된 선거만 반환한다.
 * 진행 중에 공개하면 원장이 늘어나는 순서로 누가 무엇을 찍었는지 추정할 수 있다.
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
        ledger: null,
        message: "공개 원장은 투표가 종료된 뒤 공개됩니다.",
      });
    }

    const { data, error } = await supabase.rpc("get_public_ballot_ledger", { p_election_id: id });
    const ledger = data as { success?: boolean; message?: string } | null;

    if (error || !ledger?.success) {
      return jsonError(ledger?.message ?? "공개 검증 데이터를 불러오지 못했습니다.", 500, error?.message);
    }

    return NextResponse.json({ election: normalizeElection(election), ledger });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "공개 검증 데이터를 불러오지 못했습니다.",
      500,
    );
  }
}
