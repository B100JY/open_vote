import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp } from "@/lib/api-response";
import { GoogleSignInError, exchangeGoogleCode, signInWithGoogleIdentity } from "@/lib/google-auth";
import { GOOGLE_STATE_COOKIE, getGoogleConfig, googleRedirectUri } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * 구글이 돌려보내는 곳. 결과는 항상 /admin 으로 보내고, token_hash 는 쿼리가 아니라 fragment 에 싣는다
 * (fragment 는 서버 로그·Referer 에 남지 않는다). 브라우저가 verifyOtp 로 세션을 열고 fragment 를 지운다.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const finish = (fragment: string) => {
    const response = NextResponse.redirect(`${origin}/admin#${fragment}`, 303);
    response.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
    return response;
  };
  const fail = (code: string) => finish(`gauth_error=${encodeURIComponent(code)}`);

  const expected = request.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!expected || !state || !sameState(expected, state)) return fail("state");
  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error") === "access_denied" ? "cancelled" : "google");
  }

  const config = getGoogleConfig();
  if (!config) return fail("not_configured");
  const code = url.searchParams.get("code");
  if (!code) return fail("google");

  const identity = await exchangeGoogleCode(config, code, googleRedirectUri(origin));
  if (!identity) return fail("email_unverified");

  try {
    const tokenHash = await signInWithGoogleIdentity(identity, getClientIp(request));
    return finish(new URLSearchParams({ gauth: tokenHash }).toString());
  } catch (error) {
    return fail(error instanceof GoogleSignInError ? error.code : "server");
  }
}
