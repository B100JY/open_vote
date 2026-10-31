import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { parseSmsFormat } from "@/lib/sms-format";
import { getVoteLinkBaseUrl, sendVoteInviteSms } from "@/lib/sms-invite";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 생성자(또는 관리자)가 유권자 한 명에게 새 링크·코드를 다시 보낸다. 유권자당 최대 5회.
 * 1인 단가만큼 생성자 포인트에서 차감하고, 문자가 나가지 않으면 환불한다.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; voterId: string }> }) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status, auth.error);

  const { id, voterId } = await context.params;
  const supabase = getServiceDbSupabase();
  const { data: election } = await supabase.from("elections").select("id, created_by").eq("id", id).maybeSingle();
  if (!election) return jsonError("선거 정보를 찾을 수 없습니다.", 404);
  if (!canManageElection(auth, election.created_by)) return jsonError("이 선거를 관리할 권한이 없습니다.", 403, "forbidden");

  const body = await request.json().catch(() => ({}));
  const format = parseSmsFormat(body.format);
  if (!format) return jsonError("문자 형식을 확인해주세요.",400);
  const actor = auth.user.user.id;
  const sent = await sendVoteInviteSms({
    electionId: id,
    baseUrl: getVoteLinkBaseUrl(request),
    voterIds: [voterId],
    actorId: actor,
    kind: "admin", format,
    smsTitle: typeof body.smsTitle === "string" ? body.smsTitle : undefined,
  });

  if (!sent.ok) return jsonError(sent.message,sent.status,sent.error);
  if (sent.summary.sent === 0 || sent.summary.uncertain) return jsonError(sent.summary.stopped ?? "문자를 보내지 못해 예약 포인트를 반환했습니다.",502,"send_failed");

  return NextResponse.json({
    success: true,
    resendCount: sent.summary.resendCount ?? null,
    cost: sent.summary.cost,
    refunded: sent.summary.refunded,
    message: "새 투표 문자를 보냈습니다. 예전 링크·코드는 더 쓸 수 없습니다.",
  });
}
