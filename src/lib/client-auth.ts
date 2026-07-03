"use client";

import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * 현재 Supabase 세션의 access token을 반환합니다(없으면 빈 문자열).
 */
export async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return "";
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

/**
 * 관리자 API 호출에 붙일 Authorization 헤더를 만듭니다.
 * 토큰이 없으면 빈 객체를 반환합니다(서버가 401로 처리).
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
