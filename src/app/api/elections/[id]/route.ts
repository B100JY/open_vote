import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ElectionStatus } from "@/lib/types";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statuses = new Set<ElectionStatus>(["draft", "active", "paused", "closed"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("elections")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, error?.message);
    }

    return NextResponse.json({ election: normalizeElection(data) });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 정보를 불러오지 못했습니다.",
      500,
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const statusValue = typeof body.status === "string" ? body.status : "";

    if (!statuses.has(statusValue as ElectionStatus)) {
      return jsonError("변경할 수 없는 선거 상태입니다.");
    }

    const status = statusValue as ElectionStatus;
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("elections")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      return jsonError("선거 상태를 변경하지 못했습니다.", 500, error?.message);
    }

    await supabase.from("audit_logs").insert({
      event_type: "election_status_changed",
      election_id: id,
      details: {
        status,
        changed_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ election: normalizeElection(data) });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 상태를 변경하지 못했습니다.",
      500,
    );
  }
}
