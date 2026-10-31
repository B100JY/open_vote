import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { publicElectionSummary, type PublicElectionSummary } from "@/lib/public-election-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getServiceDbSupabase();
    const now = Date.now();
    const elections: { id: string; name: string; ends_at: string | null; starts_at: string | null; auth_mode: string | null; status: string; content_restricted: boolean }[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.rpc("workspace_home_elections", { p_at: new Date(now).toISOString() }).range(offset, offset + 99);
      if (error) return jsonError("공개 투표를 불러오지 못했습니다.", 500);
      if (data?.length) {
        const {data: metadata,error: metadataError} = await supabase.from("elections").select("id,starts_at,auth_mode,organization_name").in("id",data.map((e: {id:string})=>e.id));
        if (metadataError || metadata?.length !== data.length) return jsonError("공개 투표 정보를 불러오지 못했습니다.",503);
        const byId = new Map(metadata.map(e=>[e.id,e]));
        elections.push(...data.map((e: {id:string})=>({...e,...byId.get(e.id)})));
      }
      if (!data || data.length < 100) break;
    }
    const summaries: PublicElectionSummary[] = new Array(elections.length);
    let next = 0;
    // 기존 집계 함수를 재사용하되 동시 DB 요청은 최대 4개로 제한한다.
    await Promise.all(Array.from({ length: Math.min(4, elections.length) }, async () => {
      while (next < elections.length) {
        const index = next++;
        const election = elections[index];
        if (election.content_restricted !== false) { summaries[index] = publicElectionSummary(election, null, now); continue; }
        let stats: unknown = null;
        try {
          const result = await supabase.rpc("get_election_stats", { p_election_id: election.id });
          if (!result.error) stats = result.data;
        } catch {
          // 통계 실패를 0%로 표시하지 않는다. 다른 선거의 요약은 계속 제공한다.
        }
        summaries[index] = publicElectionSummary(election, stats, now);
      }
    }));
    return NextResponse.json({ elections: summaries }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("공개 투표를 불러오지 못했습니다.", 500);
  }
}
