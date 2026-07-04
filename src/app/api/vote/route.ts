import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { recordFailedAttempt, checkRateLimit } from "@/lib/rate-limit";
import { getRequestUser, getUserEmail } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeCandidates } from "@/lib/utils";
import { voteErrorStatus } from "@/lib/vote-status";
import { hashVoterToken, isValidVoterTokenFormat } from "@/lib/voter-token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "cast_vote";

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
    const electionId =
      typeof body.electionId === "string" ? body.electionId.trim() : "";
    const selectedCandidate =
      typeof body.selectedCandidate === "string"
        ? body.selectedCandidate.trim()
        : "";
    const receiptHash =
      typeof body.receiptHash === "string"
        ? body.receiptHash.trim().toLowerCase()
        : "";

    if (!electionId || !selectedCandidate || !/^[a-f0-9]{64}$/.test(receiptHash)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("필수 항목이 누락되었거나 형식이 올바르지 않습니다.", 400);
    }

    // 인증 경로 두 가지: SMS 투표 링크 토큰(voterToken) 또는 Supabase 세션(Bearer)
    const voterToken =
      typeof body.voterToken === "string" ? body.voterToken.trim() : "";

    let userInfo = null;
    if (voterToken) {
      if (!isValidVoterTokenFormat(voterToken)) {
        await recordFailedAttempt(ipAddress, endpoint);
        return jsonError("유효하지 않은 투표 링크입니다.", 401, "invalid_token");
      }
    } else {
      userInfo = await getRequestUser(request);
      if (!userInfo) {
        await recordFailedAttempt(ipAddress, endpoint);
        return jsonError("로그인이 필요합니다.", 401, "unauthorized");
      }
    }

    const supabase = getServiceSupabase();
    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("id, status, candidates")
      .eq("id", electionId)
      .single();

    if (electionError || !election || election.status !== "active") {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError(
        "이 선거는 현재 진행 중이 아닙니다.",
        403,
        "election_not_active",
      );
    }

    const candidates = normalizeCandidates(election.candidates);
    if (!candidates.some((candidate) => candidate.id === selectedCandidate)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("선택할 수 없는 항목입니다.", 400, "invalid_candidate");
    }

    const { data: result, error } = voterToken
      ? await supabase.rpc("cast_link_vote", {
          p_election_id: electionId,
          p_token_hash: hashVoterToken(voterToken),
          p_selected_candidate: selectedCandidate,
          p_receipt_hash: receiptHash,
        })
      : await supabase.rpc("cast_registered_vote", {
          p_election_id: electionId,
          p_user_id: userInfo!.user.id,
          p_user_email: getUserEmail(userInfo!.user),
          p_selected_candidate: selectedCandidate,
          p_receipt_hash: receiptHash,
        });

    if (error) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("투표 처리 중 오류가 발생했습니다.", 500, error.message);
    }

    const voteResult = result as
      | {
          success?: boolean;
          error?: string;
          message?: string;
          receipt_hash?: string;
          sequence_number?: number;
          chain_hash?: string;
        }
      | null;

    if (!voteResult?.success) {
      await recordFailedAttempt(ipAddress, endpoint);
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
      sequenceNumber: voteResult.sequence_number ?? null,
      chainHash: voteResult.chain_hash ?? null,
    });
  } catch (error) {
    await recordFailedAttempt(ipAddress, endpoint);
    return jsonError(
      error instanceof Error ? error.message : "투표 처리 중 오류가 발생했습니다.",
      500,
    );
  }
}
