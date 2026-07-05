import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { createApiKey } from "@/lib/api-client-auth";

export const dynamic = "force-dynamic";

/** 등록된 외부 연동 API 클라이언트 목록(키 원문은 보관하지 않으므로 노출 불가) */
export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("api_clients")
      .select("id, name, owner_user_id, is_active, created_at, last_used_at")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError("API 클라이언트 목록을 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({ clients: data ?? [] });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "API 클라이언트 목록을 불러오지 못했습니다.",
      500,
    );
  }
}

/**
 * 외부 앱 연동용 API 키 발급.
 * 키 원문은 이 응답에서 한 번만 노출되며, DB에는 SHA-256 해시만 저장됩니다.
 * 발급된 키로 생성되는 투표는 소유자(ownerEmail) 포인트 계정에서 과금됩니다.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const ownerEmail =
      typeof body.ownerEmail === "string" ? body.ownerEmail.trim() : "";

    if (!name) {
      return jsonError("클라이언트 이름을 입력해주세요.", 400, "missing_name");
    }

    if (!ownerEmail) {
      return jsonError(
        "포인트 과금 대상(소유자) 이메일을 입력해주세요.",
        400,
        "missing_owner",
      );
    }

    const supabase = getServiceSupabase();

    const { data: ownerId, error: findError } = await supabase.rpc(
      "find_user_id_by_email",
      { p_email: ownerEmail },
    );

    if (findError) {
      return jsonError("사용자 조회 중 오류가 발생했습니다.", 500, findError.message);
    }

    if (!ownerId) {
      return jsonError(
        "해당 이메일의 사용자를 찾을 수 없습니다. 먼저 로그인(가입)한 사용자만 소유자로 지정할 수 있습니다.",
        404,
        "user_not_found",
      );
    }

    const { apiKey, keyHash } = createApiKey();

    const { data: client, error } = await supabase
      .from("api_clients")
      .insert({ name, owner_user_id: ownerId, key_hash: keyHash })
      .select("id, name, owner_user_id, is_active, created_at")
      .single();

    if (error || !client) {
      return jsonError("API 클라이언트 등록에 실패했습니다.", 500, error?.message);
    }

    await supabase.from("audit_logs").insert({
      event_type: "api_client_created",
      details: {
        client_id: client.id,
        name,
        owner_user_id: ownerId,
        actor: auth.user.user.id,
        created_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      client,
      // 키 원문은 지금 한 번만 반환됩니다. 분실 시 재발급해야 합니다.
      apiKey,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "API 클라이언트 등록에 실패했습니다.",
      500,
    );
  }
}
