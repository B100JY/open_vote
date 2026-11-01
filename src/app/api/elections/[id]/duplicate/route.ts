import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { makeElectionDuplicateTemplate } from "@/lib/election-duplicate";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Return ONLY reusable settings; never return roster, schedule or results. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireVoteCreator(request);
  if (!auth.ok) return jsonError(auth.message, auth.status, auth.error);

  const { id } = await context.params;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return jsonError("투표 정보를 확인해주세요.", 400);
  }

  const db = getServiceDbSupabase();
  const { data: source, error } = await db.from("elections")
    .select("id,created_by,organization_name,description_public,content_restricted,audit_version,name,description,candidates,auth_mode,sms_title,ballot_type,min_choices,max_choices,allow_blank")
    .eq("id", id).maybeSingle();
  if (error) return jsonError("투표 설정을 불러오지 못했습니다.", 503);
  if (!source || !canManageElection(auth, source.created_by)) {
    return jsonError("투표 정보를 찾을 수 없습니다.", 404);
  }

  let smsRequired = false;
  if (source.audit_version === 1) {
    const { data: audit, error: auditError } = await db.from("audit_elections")
      .select("manifest").eq("election_id", id).maybeSingle();
    if (auditError || !audit) {
      return jsonError("투표 인증 설정을 확인하지 못했습니다.", 503);
    }
    const manifest: unknown = audit.manifest;
    smsRequired = Boolean(
      manifest && typeof manifest === "object" &&
      !Array.isArray(manifest) && "smsRequired" in manifest &&
      manifest.smsRequired === true
    );
  }

  return NextResponse.json({
    template: makeElectionDuplicateTemplate(normalizeElection(source), smsRequired),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
