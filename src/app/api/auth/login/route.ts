import { NextResponse } from "next/server";
import { normalizeSignupEmail, recordLoginAttempt, signInStandaloneMember } from "@/lib/standalone-members";
import { getClientIp } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeSignupEmail(body?.email);
    if (!email || typeof body?.password !== "string") {
      return NextResponse.json({ error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
    }
    const allowed = await recordLoginAttempt(email, getClientIp(request));
    if (!allowed) return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요." }, { status: 429 });
    const session = await signInStandaloneMember(email, body.password);
    if (!session) return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    // 신원 ID는 합성 이메일로 발급되어 다른 앱의 기존 계정과 다르다.
    // no-store: 세션 토큰이 캐시에 기록되지 않도록 한다.
    return NextResponse.json({
      access_token: session.access_token, refresh_token: session.refresh_token,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "로그인에 실패했습니다." }, { status: 500 });
  }
}
