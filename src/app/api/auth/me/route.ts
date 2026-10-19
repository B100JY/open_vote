import { NextResponse } from "next/server";
import { getRequestMember } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getRequestMember(request);
  if (!user) return NextResponse.json({ error: "OpenVote 계정 로그인이 필요합니다." }, { status: 401 });
  const { id, email, display_name, role, email_verified } = user.member;
  return NextResponse.json({ member: { id, email, display_name, role, email_verified } }, {
    headers: { "Cache-Control": "no-store" },
  });
}
