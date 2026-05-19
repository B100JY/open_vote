import { NextResponse } from "next/server";
import { getClientIp, jsonError } from "@/lib/api-response";
import { recordFailedAttempt, checkRateLimit } from "@/lib/rate-limit";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const endpoint = "auth_verify";

  try {
    const limit = await checkRateLimit(ipAddress, endpoint);
    if (limit.blocked) {
      return jsonError(
        `너무 많은 시도로 인해 ${limit.remainingSeconds}초간 인증할 수 없습니다.`,
        429,
        "rate_limit_exceeded",
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const electionId =
      typeof body.electionId === "string" ? body.electionId.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const phoneSuffix =
      typeof body.phoneSuffix === "string" ? body.phoneSuffix.trim() : "";

    if (!electionId || !/^\d{6}$/.test(code) || !/^\d{4}$/.test(phoneSuffix)) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError(
        "인증코드 6자리와 전화번호 뒷자리 4자리를 정확히 입력해주세요.",
        400,
        "invalid_format",
      );
    }

    const supabase = getServiceSupabase();
    const { data: election } = await supabase
      .from("elections")
      .select("id, status")
      .eq("id", electionId)
      .maybeSingle<{ id: string; status: string }>();

    if (!election || election.status !== "active") {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError(
        "이 선거는 현재 진행 중이 아닙니다.",
        403,
        "election_not_active",
      );
    }

    const { data, error } = await supabase
      .from("voter_codes")
      .select("id")
      .eq("election_id", electionId)
      .eq("code", code)
      .eq("phone_suffix", phoneSuffix)
      .eq("is_used", false)
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      await recordFailedAttempt(ipAddress, endpoint);
      return jsonError(
        "인증코드 또는 전화번호 뒷자리를 확인해주세요.",
        401,
        "invalid_code",
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    await recordFailedAttempt(ipAddress, endpoint);
    return jsonError(
      error instanceof Error ? error.message : "인증 처리 중 오류가 발생했습니다.",
      500,
    );
  }
}
