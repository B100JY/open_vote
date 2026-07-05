import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** API 클라이언트 활성/비활성 전환 (키 유출 대응) */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    if (typeof body.isActive !== "boolean") {
      return jsonError("isActive(boolean) 값이 필요합니다.", 400, "invalid_request");
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("api_clients")
      .update({ is_active: body.isActive })
      .eq("id", id)
      .select("id, name, owner_user_id, is_active, created_at, last_used_at")
      .single();

    if (error || !data) {
      return jsonError("API 클라이언트를 찾을 수 없습니다.", 404, error?.message);
    }

    await supabase.from("audit_logs").insert({
      event_type: "api_client_updated",
      details: {
        client_id: id,
        is_active: body.isActive,
        actor: auth.user.user.id,
        updated_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ client: data });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "API 클라이언트 변경에 실패했습니다.",
      500,
    );
  }
}
