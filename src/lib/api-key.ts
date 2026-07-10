import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceDbSupabase } from "@/lib/supabase/server";

/**
 * 외부 서버-서버 연동용 API 키 인증.
 *
 * 키 형식: `ovk_<random>` — 전체 문자열의 sha256(hex)을 api_clients.key_hash와 비교한다.
 * 반환 owner_user_id가 포인트 과금 대상(=creator)이 된다.
 */

export type ApiClient = {
  id: string;
  name: string;
  owner_user_id: string;
};

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

export function apiKeyPrefix(key: string): string {
  return key.trim().slice(0, 12);
}

export function extractApiKey(request: Request): string {
  const header = request.headers.get("x-api-key");
  if (header && header.trim()) {
    return header.trim();
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^ApiKey\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function authenticateApiClient(
  request: Request,
): Promise<ApiClient | null> {
  const key = extractApiKey(request);
  if (!key || !key.startsWith("ovk_")) {
    return null;
  }

  const db: SupabaseClient = getServiceDbSupabase();
  const { data, error } = await db
    .from("api_clients")
    .select("id, name, owner_user_id, is_active")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();

  if (error || !data || data.is_active === false) {
    return null;
  }

  // 최근 사용 시각 갱신(실패해도 인증에는 영향 없음)
  await db
    .from("api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    id: data.id as string,
    name: data.name as string,
    owner_user_id: data.owner_user_id as string,
  };
}
