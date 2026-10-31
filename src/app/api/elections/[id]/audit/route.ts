import { NextResponse } from "next/server";
import { publicAudit, initializeAudit, auditBundle } from "@/lib/native-audit-server";
import { HEX, verifyBundle } from "@/lib/native-audit";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { requireElectionView } from "@/lib/election-view-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const denied = await requireElectionView(request, id, true);
    if (denied) return denied;
    const { data: election, error: electionError } = await getServiceDbSupabase().from("elections").select("status").eq("id",id).maybeSingle();
    if(electionError || !election || !["active","closed","paused"].includes(election.status)) return NextResponse.json({message:"선거를 찾을 수 없습니다."},{status:404});
    const url = new URL(request.url), c = url.searchParams.get("commitment");
    if (c && !HEX.test(c)) return NextResponse.json({ message: "약정 형식 오류" }, { status: 400 });
    if (url.searchParams.has("bundle")) {
      const bundle = await auditBundle(id);
      const report = await verifyBundle(bundle);
      return NextResponse.json({ ...bundle, report }, { headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="moai-audit-${id}.json"` } });
    }
    const data = await publicAudit(id, c ?? undefined);
    if (url.searchParams.has("checkpoint") && data) return NextResponse.json(data, {headers:{"Content-Disposition":`attachment; filename="moai-checkpoint-${id}.json"`,"Cache-Control":"no-store"}});
    if (url.searchParams.has("manifest") && data) return NextResponse.json(data.manifest, {headers:{"Content-Disposition":`attachment; filename="moai-manifest-${id}.json"`,"Cache-Control":"no-store"}});
    return NextResponse.json(data ?? { legacy: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "감사 자료를 준비하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 }); }
}
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) return NextResponse.json({ message: auth.message }, { status: auth.status });
    const { id } = await ctx.params;
    const { data, error } = await getServiceDbSupabase().from("elections").select("created_by").eq("id", id).maybeSingle();
    if (error || !data || !canManageElection(auth, data.created_by)) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
    const body = await request.json();
    return NextResponse.json({ manifest: await initializeAudit(id, body.smsRequired === true) });
  } catch { return NextResponse.json({ message: "표가 없는 선거에서만 감사 설정을 고정할 수 있습니다. 서명키와 명부를 확인해주세요." }, { status: 409 }); }
}
