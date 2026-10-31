import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { getVoteLinkBaseUrl, sendVoteInviteSms } from "@/lib/sms-invite";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 명부에 있는지·포인트가 있는지를 응답으로 알려 주면 남의 번호가 그 단체 명부에 있는지 떠볼 수 있다.
// 그래서 결과와 상관없이 같은 문구를 돌려준다.
const UNIFORM_MESSAGE =
  "등록된 번호이고 다시 보낼 수 있으면 곧 새 투표 문자가 갑니다. 문자가 오지 않으면 투표를 만든 곳에 문의해 주세요. 다시 보내기는 한 번만 됩니다.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 유권자 본인 재발송(코드 분실). 1인 1회, 비용은 선거 생성자 포인트에서 1인 단가만큼 차감.
 * 새 링크·코드를 보내므로 예전 링크·코드는 무효가 된다. 문자가 나가지 않으면 환불한다.
 */
export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "vote_self_resend";
  try {
    const limit = await checkRateLimit(ipAddress, endpoint);
    if (limit.blocked) {
      return jsonError(`요청이 많아 ${limit.remainingSeconds}초 뒤에 다시 시도해 주세요.`, 429, "rate_limit_exceeded");
    }
    // 성공·실패와 상관없이 모든 요청을 센다(번호 떠보기·문자 폭탄 방지)
    await recordFailedAttempt(ipAddress, endpoint);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const electionId = typeof body.electionId === "string" ? body.electionId.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.replace(/[^0-9]/g, "") : "";
    if (!UUID.test(electionId) || !/^01[0-9]{8,9}$/.test(phone)) {
      return jsonError("휴대폰 번호를 확인해 주세요.", 400, "invalid_phone");
    }

    const supabase = getServiceDbSupabase();
    const { data: voter, error } = await supabase.from("voter_registry").select("id").eq("election_id",electionId).eq("phone",phone).eq("has_voted",false).eq("self_resend_used",false).maybeSingle();
    if (error || !voter) {
      return NextResponse.json({ message: UNIFORM_MESSAGE });
    }

    await sendVoteInviteSms({
      electionId,
      baseUrl: getVoteLinkBaseUrl(request),
      voterIds: [voter.id],
      actorId: "voter_self_resend",
      kind: "self",
    }).catch(() => null);

    return NextResponse.json({ message: UNIFORM_MESSAGE });
  } catch {
    return NextResponse.json({ message: UNIFORM_MESSAGE });
  }
}
