import type { User } from "@supabase/supabase-js";

export const ADMIN_ROLE = "admin";
export const CREATOR_ROLE = "creator";

/**
 * 역할 판단은 Supabase 사용자의 `app_metadata.role`(또는 `app_metadata.roles`)
 * 클레임으로만 합니다.
 *
 * `app_metadata`는 서비스 롤(서버)만 수정할 수 있어 사용자가 클라이언트에서
 * 임의로 권한을 올릴 수 없습니다. 반대로 `user_metadata`는 사용자가 직접 변경할
 * 수 있으므로 권한 판단에 사용하면 권한 상승 취약점이 됩니다 — 사용하지 않습니다.
 */
function hasRole(
  user: Pick<User, "app_metadata"> | null | undefined,
  role: string,
): boolean {
  const appMetadata = user?.app_metadata as
    | { role?: unknown; roles?: unknown }
    | undefined;

  if (!appMetadata) {
    return false;
  }

  if (typeof appMetadata.role === "string" && appMetadata.role === role) {
    return true;
  }

  if (
    Array.isArray(appMetadata.roles) &&
    appMetadata.roles.some((item) => item === role)
  ) {
    return true;
  }

  return false;
}

export function isAdminUser(
  user: Pick<User, "app_metadata"> | null | undefined,
): boolean {
  return hasRole(user, ADMIN_ROLE);
}

/**
 * 투표 생성 권한: `admin` 또는 `creator` 롤.
 * creator는 자신이 만든 선거만 관리할 수 있고, admin은 모든 선거와
 * 포인트 지급·API 클라이언트 발급 같은 운영 기능까지 사용할 수 있습니다.
 */
export function isVoteCreator(
  user: Pick<User, "app_metadata"> | null | undefined,
): boolean {
  return hasRole(user, ADMIN_ROLE) || hasRole(user, CREATOR_ROLE);
}
