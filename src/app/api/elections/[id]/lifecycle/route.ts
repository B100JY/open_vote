import { NextResponse } from "next/server";
import { requireVoteCreator, canManageElection } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api-response";
import { validHomeClosedDays } from "@/lib/home-visibility";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status);
  const { id } = await ctx.params,
    db = getServiceDbSupabase();
  const { data: e } = await db
    .from("elections")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();
  if (!e || !canManageElection(auth, e.created_by))
    return jsonError("이 투표를 관리할 권한이 없습니다.", 403);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return jsonError("요청을 확인해주세요.", 400);
  if (b.action === "home_visibility") {
    if (!validHomeClosedDays(b.days)) return jsonError("홈 표시 기간은 0~365일의 정수로 입력해주세요.", 400);
    if (b.contentRestricted !== undefined && typeof b.contentRestricted !== "boolean") return jsonError("내용 공개 설정을 확인해주세요.", 400);
    const { data, error } = await db.from("elections").update({ home_closed_days: b.days, ...(typeof b.contentRestricted === "boolean" ? {content_restricted:b.contentRestricted} : {}) }).eq("id", id).is("trashed_at", null).select("id").maybeSingle();
    if (error || !data) return jsonError("홈 표시 기간을 저장하지 못했습니다. 휴지통 상태를 확인해주세요.", 409);
    return NextResponse.json({ success: true });
  }
  let result;
  if (b.action === "trash" || b.action === "restore")
    result = await db.rpc("workspace_trash", {
      p_election_id: id,
      p_restore: b.action === "restore",
    });
  else if (b.action === "schedule") {
    const date = typeof b.startsAt === "string" ? new Date(b.startsAt) : null;
    if (!date || !Number.isFinite(date.getTime()))
      return jsonError("시작 일시를 확인해주세요.", 400);
    result = await db.rpc("workspace_schedule", {
      p_election_id: id,
      p_starts_at: date.toISOString(),
    });
  } else return jsonError("요청을 확인해주세요.", 400);
  if (result.error)
    return jsonError(
      b.action === "schedule"
        ? "첫 표 접수 전·종료 전의 투표만 시작일을 바꿀 수 있습니다. 미래 일시와 마감일을 확인해주세요."
        : "진행 중인 문자 발송·정산이 있거나 상태가 바뀌었습니다. 잠시 후 다시 확인해주세요.",
      409,
    );
  return NextResponse.json({ success: true });
}
