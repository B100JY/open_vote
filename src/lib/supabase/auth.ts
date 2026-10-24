import { canAdministrate, canCreateElection } from "@/lib/admin-role";
import type { User } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getMemberByAuthId, type Member } from "@/lib/standalone-members";

export type RequestUser = { token: string; user: User };
export type AdminAuth =
  | { ok: true; user: RequestUser; member: Member }
  | { ok: false; status: number; error: string; message: string };
export type CreatorAuth =
  | { ok: true; user: RequestUser; member: Member; isAdmin: boolean }
  | { ok: false; status: number; error: string; message: string };

export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const match = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;
  const token = match[1].trim();
  const { data, error } = await getServiceSupabase().auth.getUser(token);
  if (error || !data.user) return null;
  return { token, user: data.user };
}

export function getUserEmail(user: User) {
  return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
}

export async function getRequestMember(request: Request) {
  const info = await getRequestUser(request);
  if (!info || info.user.app_metadata?.app !== "open_vote") return null;
  const member = await getMemberByAuthId(info.user.id);
  if (!member || member.role === "suspended") return null;
  return { ...info, member };
}

/** 모든 관리 API는 앱 전용 회원 DB에서 최신 권한을 확인한다. */
export async function requireAdmin(request: Request): Promise<AdminAuth> {
  const user = await getRequestMember(request);
  if (!user) return { ok: false, status: 401, error: "unauthorized", message: "모아이 로그인이 필요합니다." };
  if (!canAdministrate(user.member.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "모아이 관리자 권한이 필요합니다." };
  }
  return { ok: true, user, member: user.member };
}

export async function isRequestAdmin(request: Request): Promise<boolean> {
  const user = await getRequestMember(request);
  return canAdministrate(user?.member.role);
}

export async function requireVoteCreator(request: Request): Promise<CreatorAuth> {
  const user = await getRequestMember(request);
  if (!user) return { ok: false, status: 401, error: "unauthorized", message: "모아이 로그인이 필요합니다." };
  if (!canCreateElection(user.member.role)) {
    return { ok: false, status: 403, error: "forbidden", message: "선거 생성자 승인이 필요합니다." };
  }
  return { ok: true, user, member: user.member, isAdmin: canAdministrate(user.member.role) };
}

/** admin은 전체, creator는 본인이 만든 선거만. */
export function canManageElection(
  auth: { user: RequestUser; isAdmin: boolean }, createdBy: string | null,
): boolean {
  return auth.isAdmin || (Boolean(createdBy) && createdBy === auth.user.user.id);
}
