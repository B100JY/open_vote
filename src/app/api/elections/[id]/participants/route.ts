import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const { id } = await context.params;
    const supabase = getServiceSupabase();

    const { data: election } = await supabase
      .from("elections")
      .select("id, name")
      .eq("id", id)
      .single();

    const { data, error } = await supabase
      .from("voter_registry")
      .select("*")
      .eq("election_id", id)
      .order("email", { ascending: true });

    if (error) {
      return jsonError("유권자 명부를 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({
      election,
      voters: data ?? [],
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "유권자 명부를 불러오지 못했습니다.",
      500,
    );
  }
}
