import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { checkSmsTitle } from "@/lib/sms-title";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 안내 문자 제목만 바꾼다(생성자 본인 또는 관리자). 빈 값이면 기본 제목으로 돌아간다. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status, auth.error);

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = checkSmsTitle(body.smsTitle);
  if (!title.ok) return jsonError(title.message, 400, "invalid_sms_title");

  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.from("elections").select("id, created_by, status").eq("id", id).maybeSingle();
  if (!existing) return jsonError("선거 정보를 찾을 수 없습니다.", 404);
  if (!canManageElection(auth, existing.created_by)) return jsonError("이 선거를 변경할 권한이 없습니다.", 403, "forbidden");
  if (existing.status === "closed") return jsonError("종료된 선거는 바꿀 수 없습니다.", 409, "election_closed");

  const { data, error } = await supabase
    .from("elections")
    .update({ sms_title: title.value })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return jsonError("문자 제목을 저장하지 못했습니다.", 500, error?.message);
  return NextResponse.json({ election: normalizeElection(data) });
}
