import type { User } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAdminUser, isVoteCreator } from "@/lib/admin-role";

export type RequestUser = {
  token: string;
  user: User;
};

export type AdminAuth =
  | { ok: true; user: RequestUser }
  | { ok: false; status: number; error: string; message: string };

export type CreatorAuth =
  | { ok: true; user: RequestUser; isAdmin: boolean }
  | { ok: false; status: number; error: string; message: string };

export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const token = match[1].trim();
  if (!token) {
    return null;
  }

  const { data, error } = await getServiceSupabase().auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return { token, user: data.user };
}

export function getUserEmail(user: User) {
  return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
}

/**
 * 요청자가 로그인했고 `app_metadata.role`이 admin인지 확인합니다.
 * 관리자 전용 API 라우트에서 호출해 인증(401)과 인가(403)를 분리해 반환합니다.
 */
export async function requireAdmin(request: Request): Promise<AdminAuth> {
  const userInfo = await getRequestUser(request);

  if (!userInfo) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "로그인이 필요합니다.",
    };
  }

  if (!isAdminUser(userInfo.user)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "관리자 권한이 필요합니다.",
    };
  }

  return { ok: true, user: userInfo };
}

/**
 * 인증 헤더가 있으면 사용자 정보를 읽어 관리자 여부를 반환합니다.
 * 토큰이 없거나 유효하지 않으면 단순히 false를 반환합니다(에러 아님).
 * 공개/관리자 동작이 갈리는 GET 라우트에서 사용합니다.
 */
export async function isRequestAdmin(request: Request): Promise<boolean> {
  const userInfo = await getRequestUser(request);
  return userInfo ? isAdminUser(userInfo.user) : false;
}

/**
 * 요청자가 로그인했고 투표 생성 권한(`admin` 또는 `creator` 롤)이 있는지 확인합니다.
 * creator는 자신이 만든 선거만 관리할 수 있으므로, 선거 단위 라우트에서는
 * 반환된 `isAdmin`과 `elections.created_by`로 소유권을 추가 확인해야 합니다.
 */
export async function requireVoteCreator(request: Request): Promise<CreatorAuth> {
  const userInfo = await getRequestUser(request);

  if (!userInfo) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "로그인이 필요합니다.",
    };
  }

  if (!isVoteCreator(userInfo.user)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "투표 생성 권한이 필요합니다.",
    };
  }

  return { ok: true, user: userInfo, isAdmin: isAdminUser(userInfo.user) };
}

/**
 * 선거 소유권 확인: admin은 모든 선거, creator는 자신이 만든 선거만.
 * created_by가 비어 있는 과거 데이터는 admin만 관리할 수 있습니다.
 */
export function canManageElection(
  auth: { user: RequestUser; isAdmin: boolean },
  createdBy: string | null,
): boolean {
  if (auth.isAdmin) {
    return true;
  }
  return Boolean(createdBy) && createdBy === auth.user.user.id;
}
