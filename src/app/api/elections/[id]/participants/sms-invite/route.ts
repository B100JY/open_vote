import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getVoteLinkBaseUrl, sendVoteInviteSms, smsTargets } from "@/lib/sms-invite";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { getSmsPrices } from "@/lib/billing";
import { parseSmsFormat } from "@/lib/sms-format";

export const dynamic = "force-dynamic";
// 수백~수천 명을 묶음으로 나눠 보내므로 기본 실행 시간보다 길게 둔다
export const maxDuration = 300;

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
    const format = parseSmsFormat(body.format);
    if (!format) return jsonError("문자 형식을 확인해주세요.",400);

    const result = await sendVoteInviteSms({
      electionId: id,
      baseUrl: getVoteLinkBaseUrl(request),
      dryRun: body.dryRun === true,
      resendAll: body.resendAll === true,
      actorId: auth.user.user.id,
      format,
      smsTitle: typeof body.smsTitle === "string" ? body.smsTitle : undefined,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status, result.error);
    }

    const { requested, sent, failed, skipped, dryRun, batchId, stopped } = result.summary;
    // 상세 results에는 마스킹된 번호만 있지만 응답 크기를 줄이기 위해 실패분만 반환
    const failures = result.summary.results.filter(
      (item) => item.status === "failed" || item.status === "error" || item.status === "skipped",
    );

    return NextResponse.json({ requested, sent, failed, skipped, dryRun, batchId, stopped, failures, cost: result.summary.cost, refunded: result.summary.refunded, uncertain: result.summary.uncertain });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "문자 발송에 실패했습니다.",
      500,
    );
  }
}

/** 발송 전 대상 수·잔액·형식별 예상 예약액. 제공자 호출/발송 없음. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message,auth.status);
  const { id } = await context.params, db = getServiceDbSupabase();
  const { data: e } = await db.from("elections").select("created_by").eq("id",id).maybeSingle();
  if (!e || !canManageElection(auth,e.created_by)) return jsonError("권한이 없습니다.",403);
  const url = new URL(request.url), voterId = url.searchParams.get("voterId");
  const targets = await smsTargets(id,url.searchParams.get("resendAll")==="1",voterId?[voterId]:undefined);
  const prices = getSmsPrices();
  const { data, error } = await db.rpc("sms_quote",{ p_election_id:id,p_voter_ids:targets.map(t=>t.id),p_standard:prices.standard,p_compact:prices.compact });
  if (error || !data) return jsonError("예상 발송비를 조회하지 못했습니다.",503);
  return NextResponse.json({ ...data, prices },{headers:{"Cache-Control":"no-store"}});
}
