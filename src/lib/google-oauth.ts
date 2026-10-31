import { randomBytes } from "node:crypto";

/** 구글 OAuth 의 순수 함수들(서버·테스트 공용). 서버 쪽 처리는 google-auth.ts. */

export const GOOGLE_STATE_COOKIE = "ov_google_state";
const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type GoogleConfig = { clientId: string; clientSecret: string };

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleRedirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function buildGoogleAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

export type GoogleIdentity = { sub: string; email: string; name: string };

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("invalid_jwt");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/**
 * id_token 은 우리 서버가 client_secret 으로 구글 토큰 엔드포인트에서 TLS 로 직접 받은 값이라
 * 서명 검증 없이 iss·aud 만 확인한다(구글 OpenID 문서가 허용하는 방식). 메일 미확인 계정은 거절한다.
 */
export function identityFromClaims(claims: Record<string, unknown>, clientId: string): GoogleIdentity | null {
  if (!ISSUERS.has(String(claims.iss)) || claims.aud !== clientId) return null;
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!sub || !email || claims.email_verified !== true) return null;
  return { sub, email, name: displayNameFrom(claims.name, email) };
}

export function displayNameFrom(name: unknown, email: string): string {
  const trimmed = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (trimmed.length >= 2) return trimmed;
  const local = email.split("@")[0] ?? "";
  return (local.length >= 2 ? local : `회원${local}`).slice(0, 60);
}

export { googleErrorMessage } from "./google-oauth-messages.ts";
