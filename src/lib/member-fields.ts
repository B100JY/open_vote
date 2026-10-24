import { randomUUID } from "node:crypto";

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

