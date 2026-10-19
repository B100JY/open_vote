export type OpenVoteRole = "pending" | "creator" | "admin" | "suspended";

export const ADMIN_ROLE: OpenVoteRole = "admin";
export const CREATOR_ROLE: OpenVoteRole = "creator";

/** JWT의 app_metadata가 아니라 app_open_vote.members.role DB 조회 결과만 전달한다. */
export function canAdministrate(role: OpenVoteRole | null | undefined): boolean {
  return role === ADMIN_ROLE;
}

export function canCreateElection(role: OpenVoteRole | null | undefined): boolean {
  return role === ADMIN_ROLE || role === CREATOR_ROLE;
}
