import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400, error?: string) {
  return NextResponse.json({ success: false, error, message }, { status });
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}
