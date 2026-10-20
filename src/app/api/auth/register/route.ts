import { acceptsRegistrationCode } from "@/lib/member-fields";
import { getClientIp } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { createStandaloneMember, normalizeDisplayName, normalizeSignupEmail, recordSignupAttempt, validateSignupPassword } from "@/lib/standalone-members";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const configuredCode = process.env.OPENVOTE_SIGNUP_INVITE_CODE;
    if (!configuredCode || configuredCode.length < 16) {
      return NextResponse.json({ error: "현재 회원가입이 열려 있지 않습니다." }, { status: 503 });
    }
    if (!acceptsRegistrationCode(body?.inviteCode, configuredCode)) {
      return NextResponse.json({ error: "회원가입 초대코드가 올바르지 않습니다." }, { status: 403 });
    }
    const email = normalizeSignupEmail(body?.email);
    const name = normalizeDisplayName(body?.name);
    if (!email || !name || !validateSignupPassword(body?.password)) {
      return NextResponse.json({ error: "이름, 이메일, 8자 이상 비밀번호를 입력해주세요." }, { status: 400 });
    }
    const ip = getClientIp(request);
    const allowed = await recordSignupAttempt(email, ip);
    if (!allowed) return NextResponse.json({ error: "회원가입 시도가 너무 많습니다. 나중에 다시 시도해주세요." }, { status: 429 });

    await createStandaloneMember({ email, name, password: body.password });
    return NextResponse.json({
      success: true,
      message: "다모음 전용 계정이 생성되었습니다. 선거 생성은 관리자 승인 후 가능합니다. 이메일은 아직 확인되지 않았습니다.",
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "회원가입 오류" }, { status: 400 });
  }
}
