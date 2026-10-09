import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { recordFailedAttempt, checkRateLimit } from "@/lib/rate-limit";
import { getRequestUser, getUserEmail } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { voteErrorStatus } from "@/lib/vote-status";

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
    const selection = body.selection;
    const receiptHash =
      typeof body.receiptHash === "string"
        ? body.receiptHash.trim().toLowerCase()
        : "";

    if (!electionId || !selection || typeof selection !== "object" || !/^[a-f0-9]{64}$/.test(receiptHash)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("필수 항목이 누락되었거나 형식이 올바르지 않습니다.", 400);
    }

    const userInfo = await getRequestUser(request);
    if (!userInfo) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("로그인이 필요합니다.", 401, "unauthorized");
    }

    const supabase = getServiceDbSupabase();
    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("id, auth_mode")
      .eq("id", electionId)
      .single<{ id: string; auth_mode: string }>();

    if (electionError || !election) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("선거 정보를 찾을 수 없습니다.", 403, "election_not_found");
    }

    // sms_token 방식은 세션이 아니라 1회용 링크(/api/vote/link)로만 투표한다.
    if (election.auth_mode === "sms_token") {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError(
        "이 투표는 문자로 받은 개별 링크로만 참여할 수 있습니다.",
        403,
        "auth_mode_mismatch",
      );
    }

    // 기간·상태·선택 규칙 검증은 DB 함수(cast_ballot_internal)가 한 트랜잭션에서 한다.
    const { data: result, error } =
      election.auth_mode === "member_session"
        ? await supabase.rpc("cast_member_ballot", {
            p_election_id: electionId,
            p_user_id: userInfo.user.id,
            p_selection: selection,
            p_receipt_hash: receiptHash,
          })
        : await supabase.rpc("cast_registered_ballot", {
            p_election_id: electionId,
            p_user_id: userInfo.user.id,
            p_user_email: getUserEmail(userInfo.user),
            p_selection: selection,
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
        }
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
    return jsonError(
      error instanceof Error ? error.message : "투표 처리 중 오류가 발생했습니다.",
      500,
    );
  }
}
