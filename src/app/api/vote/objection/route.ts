import { NextResponse } from "next/server";
import { resolveVoteCredential } from "@/lib/vote-credential";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { getClientIp, jsonError } from "@/lib/api-response";
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if ((await checkRateLimit(ip, "trash_objection")).blocked)
    return jsonError("잠시 후 다시 시도해주세요.", 429);
  const b = await request.json().catch(() => ({}));
  const r = await resolveVoteCredential(request, b, { allowExpired: true });
  if (!r) {
    await recordFailedAttempt(ip, "trash_objection");
    return jsonError("투표 코드·링크를 확인해주세요.", 403);
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 2 || reason.length > 1000)
    return jsonError("이의제기 내용을 2~1000자로 입력해주세요.", 400);
  const { error } = await getServiceDbSupabase().rpc("workspace_objection", {
    p_registry_id: r.id,
    p_reason: reason,
  });
  return error
    ? jsonError("삭제 대기 상태가 아닙니다. 다시 조회해주세요.", 409)
    : NextResponse.json(
        { success: true, held: true },
        { headers: { "Cache-Control": "no-store" } },
      );
}
