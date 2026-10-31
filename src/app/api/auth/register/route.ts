import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** 이메일·비밀번호 가입은 닫았다. 새 계정은 구글로만 만든다(/api/auth/google/start). */
export async function POST() {
  return NextResponse.json({ error: "구글 계정으로 가입해 주세요." }, { status: 410 });
}
