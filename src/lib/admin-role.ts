import type { User } from "@supabase/supabase-js";

export const ADMIN_ROLE = "admin";

/**
 * 관리자 여부는 Supabase 사용자의 `app_metadata.role`(또는 `app_metadata.roles`)
 * 클레임으로만 판단합니다.
 *
 * `app_metadata`는 서비스 롤(서버)만 수정할 수 있어 사용자가 클라이언트에서
 * 임의로 권한을 올릴 수 없습니다. 반대로 `user_metadata`는 사용자가 직접 변경할
 * 수 있으므로 권한 판단에 사용하면 권한 상승 취약점이 됩니다 — 사용하지 않습니다.
 */
export function isAdminUser(
  user: Pick<User, "app_metadata"> | null | undefined,
): boolean {
  const appMetadata = user?.app_metadata as
    | { role?: unknown; roles?: unknown }
    | undefined;

  if (!appMetadata) {
    return false;
  }

  if (typeof appMetadata.role === "string" && appMetadata.role === ADMIN_ROLE) {
    return true;
  }

  if (
    Array.isArray(appMetadata.roles) &&
    appMetadata.roles.some((role) => role === ADMIN_ROLE)
  ) {
    return true;
  }

  return false;
}
