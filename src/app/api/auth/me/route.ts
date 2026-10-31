import { NextResponse } from "next/server";
import { getRequestMember } from "@/lib/supabase/auth";
import { normalizeDisplayName } from "@/lib/member-fields";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function memberBody(user: NonNullable<Awaited<ReturnType<typeof getRequestMember>>>, displayName?: string) {
  const { id, email, display_name, role, email_verified } = user.member;
  return {
    member: {
      id,
      email,
      display_name: displayName ?? display_name,
      role,
      email_verified,
      // 구글로 가입했거나 구글로 이어진 계정인지(설정 화면 표시용)
      google_linked: typeof user.user.app_metadata?.google_sub === "string",
    },
  };
}

export async function GET(request: Request) {
  const user = await getRequestMember(request);
  if (!user) return NextResponse.json({ error: "모아이투표 계정 로그인이 필요합니다." }, { status: 401 });
  return NextResponse.json(memberBody(user), { headers: { "Cache-Control": "no-store" } });
}

/** 개인 설정: 지금은 표시 이름만 바꿀 수 있다. 메일·권한은 바꾸지 않는다. */
export async function PATCH(request: Request) {
  const user = await getRequestMember(request);
  if (!user) return NextResponse.json({ error: "모아이투표 계정 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = normalizeDisplayName(body?.displayName);
  if (!name) return NextResponse.json({ error: "이름은 2자 이상 60자 이하로 입력해 주세요." }, { status: 400 });

  const { error } = await getServiceDbSupabase()
    .from("members")
    .update({ display_name: name })
    .eq("id", user.member.id);
  if (error) return NextResponse.json({ error: "이름을 저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json(memberBody(user, name), { headers: { "Cache-Control": "no-store" } });
}
