import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getVoteLinkBaseUrl, sendVoteInviteSms } from "@/lib/sms-invite";

export const dynamic = "force-dynamic";

/**
 * 미투표 유권자(전화번호 보유)에게 개인화 투표 링크 SMS 발송.
 *
 * body:
 *  - dryRun?: boolean     실제 발송 없이 notifier 렌더 미리보기(과금·한도 미소모)
 *  - resendAll?: boolean  이미 발송된 미투표 유권자에게도 새 링크 재발송
 *                         (재발송 시 이전 링크는 무효화됩니다)
 */
export async function POST(
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
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (electionError || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    if (!canManageElection(auth, election.created_by)) {
      return jsonError("이 선거의 문자를 발송할 권한이 없습니다.", 403, "forbidden");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const result = await sendVoteInviteSms({
      electionId: id,
      baseUrl: getVoteLinkBaseUrl(request),
      dryRun: body.dryRun === true,
      resendAll: body.resendAll === true,
      actorId: auth.user.user.id,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status, result.error);
    }

    const { requested, sent, failed, skipped, dryRun, batchId } = result.summary;
    // 상세 results에는 마스킹된 번호만 있지만 응답 크기를 줄이기 위해 실패분만 반환
    const failures = result.summary.results.filter(
      (item) => item.status === "failed" || item.status === "error" || item.status === "skipped",
    );

    return NextResponse.json({ requested, sent, failed, skipped, dryRun, batchId, failures });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "문자 발송에 실패했습니다.",
      500,
    );
  }
}
