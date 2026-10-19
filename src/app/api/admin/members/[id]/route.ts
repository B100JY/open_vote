import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const role = body?.role;
  const verifyIdentity = body?.verifyIdentity === true;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (!verifyIdentity && !["pending", "creator", "admin", "suspended"].includes(role))) {
    return NextResponse.json({ error: "회원 또는 권한 값이 올바르지 않습니다." }, { status: 400 });
  }
  if (verifyIdentity) {
    if (body?.attestation !== "confirmed_in_person") {
      return NextResponse.json({ error: "별도 수단으로 본인확인을 마친 경우에만 인증할 수 있습니다." }, { status: 400 });
    }
    const db = getServiceDbSupabase();
    const { data, error } = await db.from("members").update({
      email_verified: true, updated_at: new Date().toISOString(),
    }).eq("id", id).neq("role", "admin").select("id, email_verified").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "회원 확인에 실패했습니다." }, { status: 404 });
    await db.from("audit_logs").insert({ event_type: "member_identity_verified", details: {
      member_id: id, actor_user_id: auth.user.user.id, method: "confirmed_in_person",
    } });
    return NextResponse.json({ member: data });
  }
  if (id === auth.member.id) {
    return NextResponse.json({ error: "관리자는 자신의 권한을 변경할 수 없습니다." }, { status: 409 });
  }
  // 관리자 승인 API: 신규 admin 지정은 명시적 별도 수동 승인으로만 한다.
  if (role === "admin") {
    return NextResponse.json({ error: "관리자 승격은 승인된 운영 절차로만 가능합니다." }, { status: 403 });
  }
  const db = getServiceDbSupabase();
  if (role === "creator") {
    const { data: target } = await db.from("members").select("email_verified").eq("id", id).maybeSingle();
    if (!target?.email_verified) return NextResponse.json({ error: "본인확인 후 생성자 권한을 승인할 수 있습니다." }, { status: 409 });
  }
  const { data: member, error } = await db.from("members").update({
    role, updated_at: new Date().toISOString(),
  }).eq("id", id).neq("role", "admin").select("id, role").maybeSingle();
  if (error || !member) return NextResponse.json({ error: "해당 회원의 권한을 변경하지 못했습니다." }, { status: 404 });
  await db.from("audit_logs").insert({ event_type: "member_role_updated", details: {
    member_id: id, role, actor_user_id: auth.user.user.id,
  } });
  return NextResponse.json({ member });
}
