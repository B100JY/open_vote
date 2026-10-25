import { randomBytes } from "node:crypto";
import {
  GOOGLE_TOKEN_ENDPOINT,
  decodeJwtPayload,
  identityFromClaims,
  type GoogleConfig,
  type GoogleIdentity,
} from "@/lib/google-oauth";
import { syntheticAccountEmail } from "@/lib/member-fields";
import { recordSignupAttempt } from "@/lib/standalone-members";
import { getServiceDbSupabase, getServiceSupabase } from "@/lib/supabase/server";

/**
 * 모아이투표 구글 가입·로그인.
 *
 * 공유 Supabase 의 GoTrue 소셜 신원은 노조링크 전용이라(루트 AGENTS.md §3) signInWithOAuth 를 쓰지 않는다.
 * 모아이투표 자체 구글 OAuth 클라이언트로 code 를 바꾸고, 확인된 구글 메일로 members 를 찾거나 만든 뒤
 * 모아이투표 합성 계정(u…@member.openvote.invalid)의 magiclink token_hash 를 발급해 브라우저가 verifyOtp 로 세션을 연다.
 */

export async function exchangeGoogleCode(config: GoogleConfig, code: string, redirectUri: string) {
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const token = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!token || typeof token.id_token !== "string") return null;
  try {
    return identityFromClaims(decodeJwtPayload(token.id_token), config.clientId);
  } catch {
    return null;
  }
}

export class GoogleSignInError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * 확인된 구글 메일로 모아이투표 회원을 찾거나 새로 만들고, 로그인용 magiclink token_hash 를 돌려준다.
 * 메일이 같으면 비밀번호로 가입했던 기존 회원과 같은 사람으로 본다(구글이 메일 소유를 확인했으므로).
 */
export async function signInWithGoogleIdentity(identity: GoogleIdentity, ip: string): Promise<string> {
  const db = getServiceDbSupabase();
  const admin = getServiceSupabase();

  const { data: member, error } = await db.from("members")
    .select("id, auth_user_id, role")
    .eq("email", identity.email)
    .maybeSingle<{ id: string; auth_user_id: string; role: string }>();
  if (error) throw new GoogleSignInError("server");

  let authUserId: string;
  if (member) {
    if (member.role === "suspended") throw new GoogleSignInError("suspended");
    const { data: found, error: userError } = await admin.auth.admin.getUserById(member.auth_user_id);
    const meta = found?.user?.app_metadata as Record<string, unknown> | undefined;
    if (userError || !found?.user || meta?.app !== "open_vote") throw new GoogleSignInError("server");
    // 구글로 만든 계정이면 sub 까지 같아야 한다(같은 메일을 다른 구글 계정이 쓰게 된 경우 차단).
    // 비밀번호로 가입했던 계정은 sub 가 없고, 공유 auth 가드상 updateUserById 를 쓰지 않으므로 메일로만 잇는다.
    if (typeof meta.google_sub === "string" && meta.google_sub !== identity.sub) {
      throw new GoogleSignInError("account_mismatch");
    }
    await db.from("members").update({ email_verified: true }).eq("id", member.id);
    authUserId = member.auth_user_id;
  } else {
    const allowed = await recordSignupAttempt(identity.email, ip).catch(() => {
      throw new GoogleSignInError("server");
    });
    if (!allowed) throw new GoogleSignInError("rate_limited");

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: syntheticAccountEmail(),
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      // user_metadata 는 사용자가 고칠 수 있으므로 sub 는 app_metadata 에만 둔다.
      app_metadata: { app: "open_vote", google_sub: identity.sub },
    });
    if (createError || !created.user) throw new GoogleSignInError("create");

    const { error: insertError } = await db.from("members").insert({
      auth_user_id: created.user.id,
      email: identity.email,
      display_name: identity.name,
      role: "pending",
      email_verified: true,
    });
    // 실패해도 다른 앱 계정은 지우지 않는다. 회원행 없는 합성 계정은 운영 점검 대상으로 남는다.
    if (insertError) throw new GoogleSignInError("create");
    authUserId = created.user.id;
  }

  // 로그인 메일 주소는 저장하지 않고 매번 읽는다.
  const { data: account } = await admin.auth.admin.getUserById(authUserId);
  const loginEmail = account?.user?.email;
  if (!loginEmail) throw new GoogleSignInError("server");
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new GoogleSignInError("server");
  return tokenHash;
}
