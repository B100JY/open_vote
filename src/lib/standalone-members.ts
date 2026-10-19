import { createHash } from "node:crypto";
import { syntheticAccountEmail } from "@/lib/member-fields";
import { createClient } from "@supabase/supabase-js";
import { getServiceDbSupabase, getServiceSupabase } from "@/lib/supabase/server";

export type OpenVoteRole = "pending" | "creator" | "admin" | "suspended";
export type Member = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: OpenVoteRole;
  email_verified: boolean;
  created_at: string;
};

export { normalizeSignupEmail, validateSignupPassword, normalizeDisplayName } from "@/lib/member-fields";

export async function getMemberByAuthId(authUserId: string): Promise<Member | null> {
  const { data, error } = await getServiceDbSupabase()
    .from("members")
    .select("id, auth_user_id, email, display_name, role, email_verified, created_at")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error("OpenVote 회원 정보를 확인할 수 없습니다.");
  return (data as Member | null) ?? null;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 서버리스 인스턴스 간에도 적용되는 회원가입 한도. 이메일 3회/24시간, IP 10회/시간. */
export async function recordSignupAttempt(email: string, ip: string): Promise<boolean> {
  const db = getServiceDbSupabase();
  const emailHash = hash(`openvote-email:${email}`);
  const ipHash = hash(`openvote-ip:${ip}`);
  const { data, error } = await db.rpc("claim_signup_attempt", {
    p_email_hash: emailHash, p_ip_hash: ipHash,
  });
  if (error) throw new Error("회원가입 요청을 제한하는 중 오류가 발생했습니다.");
  return data === true;
}

export async function recordLoginAttempt(email: string, ip: string): Promise<boolean> {
  const { data, error } = await getServiceDbSupabase().rpc("claim_login_attempt", {
    p_email_hash: hash(`openvote-login-email:${email}`),
    p_ip_hash: hash(`openvote-login-ip:${ip}`),
  });
  if (error) throw new Error("로그인 시도 제한을 확인할 수 없습니다.");
  return data === true;
}

export async function createStandaloneMember(input: { email: string; password: string; name: string }): Promise<void> {
  const db = getServiceDbSupabase();
  const { data: found, error: existingError } = await db.from("members")
    .select("id").eq("email", input.email).maybeSingle();
  if (existingError) throw new Error("회원 정보를 확인하지 못했습니다.");
  if (found) throw new Error("가입할 수 없는 이메일입니다.");

  const { data, error } = await getServiceSupabase().auth.admin.createUser({
    email: syntheticAccountEmail(),
    password: input.password,
    email_confirm: true,
    app_metadata: { app: "open_vote" },
  });
  if (error || !data.user) throw new Error("회원 계정 생성에 실패했습니다.");

  // Auth와 Postgres 간 분산 트랜잭션이 없다. 실패 시 다른 앱 계정/신원을 삭제하지 않고
  // OpenVote 합성 계정(앱 태그, 회원행 없음)을 운영 점검 대상으로 남긴다.
  const result = await db.from("members").insert({
    auth_user_id: data.user.id,
    email: input.email,
    display_name: input.name,
    role: "pending",
    email_verified: false,
  });
  if (result.error) throw new Error("회원 등록이 완료되지 않았습니다. 관리자에게 문의해 주세요.");
}

/**
 * 로그인은 외부 메일 주소로 OpenVote 회원을 조회한 뒤, 합성 GoTrue 신원으로
 * 패스워드를 검증한다. 다른 앱 계정은 인증 후보로 사용하지 않는다.
 */
export async function signInStandaloneMember(email: string, password: string) {
  const db = getServiceDbSupabase();
  const { data, error } = await db.from("members")
    .select("auth_user_id, role").eq("email", email).maybeSingle<{ auth_user_id: string; role: OpenVoteRole }>();
  if (error || !data || data.role === "suspended") return null;

  const admin = getServiceSupabase();
  const { data: userInfo, error: userError } = await admin.auth.admin.getUserById(data.auth_user_id);
  if (userError || !userInfo.user?.email || userInfo.user.app_metadata?.app !== "open_vote") return null;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("서비스 인증 환경 설정이 누락되었습니다.");
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await auth.auth.signInWithPassword({ email: userInfo.user.email, password });
  if (result.error || !result.data.session || result.data.user.id !== data.auth_user_id) return null;
  return result.data.session;
}
