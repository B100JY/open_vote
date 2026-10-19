import { randomUUID, timingSafeEqual } from "node:crypto";

export function normalizeSignupEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // 이메일은 연락처/표시용. SMTP가 없으므로 본인확인 증명으로 간주하지 않는다.
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function validateSignupPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 2 && name.length <= 60 ? name : null;
}

export function syntheticAccountEmail(): string {
  return `u${randomUUID().replaceAll("-", "")}@member.openvote.invalid`;
}


/** 비공개 초대코드: 설정이 없거나 최소 길이에 미달하면 누구도 가입할 수 없다. */
export function acceptsRegistrationCode(
  supplied: unknown,
  configured: string | undefined,
): boolean {
  if (typeof supplied !== "string" || !configured || configured.length < 16) return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(configured, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
