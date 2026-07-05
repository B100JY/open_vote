import { createHash, randomBytes } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/server";

/**
 * 외부 앱 연동용 API 키 인증.
 *
 * - 키는 `ovk_` 접두사 + 48자리 hex이며 발급 시 1회만 노출됩니다.
 * - DB(api_clients)에는 SHA-256 해시만 저장하므로 유출 시 원문 복원이 불가합니다.
 * - 인증된 클라이언트의 `owner_user_id`가 선거 생성자(created_by)이자
 *   포인트 차감 대상 계정이 됩니다.
 */

export type ApiClient = {
  id: string;
  name: string;
  owner_user_id: string;
};

export type ApiClientAuth =
  | { ok: true; client: ApiClient }
  | { ok: false; status: number; error: string; message: string };

export function createApiKey(): { apiKey: string; keyHash: string } {
  const apiKey = `ovk_${randomBytes(24).toString("hex")}`;
  return { apiKey, keyHash: hashApiKey(apiKey) };
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf-8").digest("hex");
}

export async function authenticateApiClient(
  request: Request,
): Promise<ApiClientAuth> {
  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";

  if (!apiKey || !/^ovk_[0-9a-f]{48}$/.test(apiKey)) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "유효한 X-Api-Key 헤더가 필요합니다.",
    };
  }

  const supabase = getServiceSupabase();
  const { data: client, error } = await supabase
    .from("api_clients")
    .select("id, name, owner_user_id, is_active")
    .eq("key_hash", hashApiKey(apiKey))
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      message: "API 키 확인 중 오류가 발생했습니다.",
    };
  }

  if (!client || !client.is_active) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "등록되지 않았거나 비활성화된 API 키입니다.",
    };
  }

  // 사용 시각 기록은 인증 성공에 영향을 주지 않는 부가 정보이므로 실패를 무시합니다.
  await supabase
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id)
    .then(() => undefined);

  return {
    ok: true,
    client: {
      id: client.id,
      name: client.name,
      owner_user_id: client.owner_user_id,
    },
  };
}
