import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json({ success: false, error, message }, { status });
}

/**
 * 클라이언트 IP를 결정합니다.
 *
 * 프록시 헤더는 신뢰할 수 있는 엣지(예: Vercel, Cloudflare, 내부 Nginx)가
 * 설정할 때만 의미가 있으므로, 신뢰할 헤더를 `CLIENT_IP_HEADER` 환경 변수로
 * 고정합니다(기본 `x-forwarded-for`). x-forwarded-for는 "client, proxy1, proxy2"
 * 형태라 가장 앞(원 클라이언트) 값을 사용합니다.
 */
export function getClientIp(request: Request) {
  const trustedHeader = (
    process.env.CLIENT_IP_HEADER ?? "x-forwarded-for"
  ).toLowerCase();

  const trusted = request.headers.get(trustedHeader);
  if (trusted) {
    const first = trusted.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}
