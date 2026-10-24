import { NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  buildGoogleAuthorizeUrl,
  createOAuthState,
  getGoogleConfig,
  googleRedirectUri,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/** 구글 동의 화면으로 보낸다. state 는 httpOnly 쿠키에 두고 콜백에서 대조한다. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const config = getGoogleConfig();
  if (!config) return NextResponse.redirect(`${origin}/admin#gauth_error=not_configured`, 303);

  const state = createOAuthState();
  const response = NextResponse.redirect(
    buildGoogleAuthorizeUrl(config.clientId, googleRedirectUri(origin), state),
    303,
  );
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return response;
}
