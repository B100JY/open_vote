import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { getVoterCodePepper, hashVoterCode, normalizeVoterCode } from "@/lib/voter-code";
import { loadVoterLinkStatus } from "@/lib/vote-link-status";

export const dynamic = "force-dynamic";

/**
 * 투표 코드로 선거·참여 상태를 조회한다. 코드는 주소(쿼리)가 아니라 본문으로 받는다(접속 기록에 남지 않게).
 * 틀린 코드는 IP 기준 실패 횟수에 넣는다(5회 실패 → 15분 차단).
 */
export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "vote_code";
  try {
    const limit = await checkRateLimit(ipAddress, endpoint);
    if (limit.blocked) {
      return jsonError(`코드를 여러 번 틀려 ${limit.remainingSeconds}초 동안 입력할 수 없습니다.`, 429, "rate_limit_exceeded");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = normalizeVoterCode(body.code);
    const pepper = getVoterCodePepper();
    if (!pepper) return jsonError("투표 코드를 사용할 수 없습니다.", 503, "code_not_configured");
    if (!code) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("투표 코드는 6자리입니다. 문자에 있는 코드를 다시 확인해 주세요.", 400, "invalid_code");
    }

    const status = await loadVoterLinkStatus("code_hash", hashVoterCode(code, pepper));
    if (!status) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError("맞는 투표 코드가 없습니다. 문자에 있는 코드를 다시 확인해 주세요.", 404, "invalid_code");
    }
    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "투표 정보를 불러오지 못했습니다.", 500);
  }
}
