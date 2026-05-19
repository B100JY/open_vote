import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const supabase = getServiceSupabase();

    const { data: election } = await supabase
      .from("elections")
      .select("id, name")
      .eq("id", id)
      .single();

    const { data, error } = await supabase
      .from("voter_codes")
      .select("*")
      .eq("election_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      return jsonError("인증코드 목록을 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({
      election,
      codes: data ?? [],
    });
  } catch (error) {
    return jsonError(
      error instanceof Error
        ? error.message
        : "인증코드 목록을 불러오지 못했습니다.",
      500,
    );
  }
}
