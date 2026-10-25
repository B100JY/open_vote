import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { recordFailedAttempt, checkRateLimit } from "@/lib/rate-limit";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { getVoterCodePepper, hashVoterCode, normalizeVoterCode } from "@/lib/voter-code";
import { voteErrorStatus } from "@/lib/vote-status";

export const dynamic = "force-dynamic";

/** 투표 코드로 기표한다(cast_code_ballot). 기간·선택 규칙 검증은 DB 함수가 한다. */
export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "cast_code_vote";

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
    const code = normalizeVoterCode(body.code);
    const pepper = getVoterCodePepper();
    if (!pepper) {
      return jsonError("투표 코드를 사용할 수 없습니다.", 503, "code_not_configured");
    }
    const selection = body.selection;
    const receiptHash = typeof body.receiptHash === "string" ? body.receiptHash.trim().toLowerCase() : "";

    if (!code || !selection || typeof selection !== "object" || !/^[a-f0-9]{64}$/.test(receiptHash)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("필수 항목이 누락되었거나 형식이 올바르지 않습니다.", 400);
    }

    const supabase = getServiceDbSupabase();
    const { data: result, error } = await supabase.rpc("cast_code_ballot", {
      p_code_hash: hashVoterCode(code, pepper),
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
