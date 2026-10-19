import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { recordFailedAttempt, checkRateLimit } from "@/lib/rate-limit";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";
import { voteErrorStatus } from "@/lib/vote-status";

export const dynamic = "force-dynamic";

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

type RegistryRow = {
  id: string;
  election_id: string;
  has_voted: boolean;
  token_expires_at: string | null;
};

/** 문자 토큰으로 선거/후보/투표 방식/참여상태를 조회한다(PII 미노출). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return jsonError("투표 토큰이 필요합니다.", 400, "missing_token");
    }

    const supabase = getServiceDbSupabase();
    await supabase.rpc("close_expired_elections");

    const { data: registry } = await supabase
      .from("voter_registry")
      .select("id, election_id, has_voted, token_expires_at")
      .eq("token_hash", tokenHash(token))
      .maybeSingle<RegistryRow>();

    if (!registry) {
      return jsonError("유효하지 않은 투표 링크입니다.", 404, "invalid_token");
    }

    const { data: row } = await supabase
      .from("elections")
      .select("*")
      .eq("id", registry.election_id)
      .maybeSingle();

    if (!row) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, "election_not_found");
    }

    const election = normalizeElection(row);
    const now = Date.now();

    return NextResponse.json({
      election: {
        id: election.id,
        name: election.name,
        description: election.description,
        candidates: election.candidates,
        status: election.status,
        starts_at: election.starts_at,
        ends_at: election.ends_at,
        ballot_type: election.ballot_type,
        min_choices: election.min_choices,
        max_choices: election.max_choices,
        allow_blank: election.allow_blank,
      },
      hasVoted: registry.has_voted,
      expired: registry.token_expires_at ? new Date(registry.token_expires_at).getTime() < now : false,
      ended: election.ends_at ? new Date(election.ends_at).getTime() <= now : false,
      notStarted: election.starts_at ? new Date(election.starts_at).getTime() > now : false,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "투표 정보를 불러오지 못했습니다.", 500);
  }
}

/** 문자 토큰으로 기표한다(cast_link_ballot). 기간·선택 규칙 검증은 DB 함수가 한다. */
export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "cast_link_vote";

  try {
    const limit = await checkRateLimit(ipAddress, endpoint);
    if (limit.blocked) {
      return jsonError(
        `너무 많은 시도로 인해 ${limit.remainingSeconds}초간 투표할 수 없습니다.`,
        429,
        "rate_limit_exceeded",
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const selection = body.selection;
    const receiptHash = typeof body.receiptHash === "string" ? body.receiptHash.trim().toLowerCase() : "";

    if (!token || !selection || typeof selection !== "object" || !/^[a-f0-9]{64}$/.test(receiptHash)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("필수 항목이 누락되었거나 형식이 올바르지 않습니다.", 400);
    }

    const supabase = getServiceDbSupabase();
    const { data: result, error } = await supabase.rpc("cast_link_ballot", {
      p_token: token,
      p_selection: selection,
      p_receipt_hash: receiptHash,
    });

    if (error) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("투표 처리 중 오류가 발생했습니다.", 500, error.message);
    }

    const voteResult = result as
      | { success?: boolean; error?: string; message?: string; receipt_hash?: string }
      | null;

    if (!voteResult?.success) {
      // 선택 규칙 위반은 사용자 실수이므로 무차별 대입 카운트에 넣지 않는다
      if (voteErrorStatus(voteResult?.error) !== 400) {
        await recordFailedAttempt(ipAddress, endpoint);
      }
      return jsonError(
        voteResult?.message ?? "투표를 완료하지 못했습니다.",
        voteErrorStatus(voteResult?.error),
        voteResult?.error,
      );
    }

    return NextResponse.json({
      success: true,
      message: voteResult.message ?? "투표가 완료되었습니다.",
      receiptHash: voteResult.receipt_hash ?? receiptHash,
    });
  } catch (error) {
    await recordFailedAttempt(ipAddress, endpoint);
    return jsonError(error instanceof Error ? error.message : "투표 처리 중 오류가 발생했습니다.", 500);
  }
}
