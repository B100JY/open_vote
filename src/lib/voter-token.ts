import { createHash, randomBytes } from "node:crypto";

/**
 * SMS 투표 링크용 1인 1토큰.
 *
 * - 원문 토큰은 문자 메시지 URL(`/v/<token>`)에만 들어가고 DB에는 SHA-256 해시만
 *   저장합니다(DB 유출 시 대리 투표 방지).
 * - 재발송 시 토큰을 새로 생성해 교체(회전)하므로 이전 링크는 무효화됩니다.
 */

/** URL-safe 토큰. 16바이트 = base64url 22자 (SMS 길이 절약) */
export function createVoterToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashVoterToken(token: string): string {
  return createHash("sha256").update(token, "utf-8").digest("hex");
}

/** 라우트 파라미터로 들어온 토큰의 형식 검증(base64url, 16~64자) */
export function isValidVoterTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}
