import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getCreditPerVoter } from "@/lib/billing";
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

  const unitPrice = getCreditPerVoter();
  const actor = auth.user.user.id;
  const { data, error } = await supabase.rpc("charge_admin_resend", {
    p_election_id: id,
    p_voter_id: voterId,
    p_unit_price: unitPrice,
    p_actor: actor,
  });
  const charged = data as { success?: boolean; error?: string; message?: string; resend_count?: number } | null;
  if (error) return jsonError("다시 보내기를 처리하지 못했습니다.", 500, error.message);
  if (!charged?.success) {
    const status = charged?.error === "insufficient_credits" ? 402 : charged?.error === "not_found" ? 404 : 409;
    return jsonError(charged?.message ?? "다시 보낼 수 없습니다.", status, charged?.error);
  }

  const sent = await sendVoteInviteSms({
    electionId: id,
    baseUrl: getVoteLinkBaseUrl(request),
    voterIds: [voterId],
    actorId: actor,
  }).catch(() => null);

  if (!sent?.ok || sent.summary.sent === 0) {
    await supabase.rpc("refund_admin_resend", {
      p_election_id: id,
      p_voter_id: voterId,
      p_unit_price: unitPrice,
      p_actor: actor,
    });
    const reason = sent?.ok ? sent.summary.results[0]?.reason ?? sent.summary.stopped : sent?.message;
    return jsonError(`문자를 보내지 못해 포인트를 돌려드렸습니다.${reason ? ` (${reason})` : ""}`, 502, "send_failed");
  }

  return NextResponse.json({
    success: true,
    resendCount: charged.resend_count ?? null,
    cost: unitPrice,
    message: `새 링크와 코드를 보냈습니다. 예전 링크·코드는 더 쓸 수 없습니다.`,
  });
}
