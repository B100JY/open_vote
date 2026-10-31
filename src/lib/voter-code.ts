import { createHmac, randomInt } from "node:crypto";

/**
 * 투표 코드 — 문자 링크를 누르기 꺼리는 유권자가 사이트에서 직접 입력하는 6자.
 *
 * - 헷갈리는 0·O·1·I 를 뺀 32자 알파벳. 경우의 수 32^6 ≈ 10.7억.
 * - 원문은 문자에만. DB 에는 HMAC-SHA256(서버 pepper) 만 저장한다. 6자는 짧아서
 *   그냥 SHA-256 이면 DB 가 샜을 때 전수 대입으로 풀린다.
 * - 입력은 대소문자·공백·하이픈을 무시한다. 문자에는 "ABC-234" 처럼 3-3 으로 보낸다.
 */

export const VOTER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const VOTER_CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${VOTER_CODE_ALPHABET}]{${VOTER_CODE_LENGTH}}$`);

export function createVoterCode(): string {
  let code = "";
  for (let index = 0; index < VOTER_CODE_LENGTH; index += 1) {
    code += VOTER_CODE_ALPHABET[randomInt(VOTER_CODE_ALPHABET.length)];
  }
  return code;
}

/** 사람이 친 값을 정규화한다. 형식이 틀리면 null. */
export function normalizeVoterCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** 문자에 넣는 표시 형식: ABC-234 */
export function formatVoterCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function hashVoterCode(code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(code, "utf8").digest("hex");
}

/** 서버 비밀 pepper. 32자 미만이거나 없으면 코드 기능을 쓰지 않는다. */
export function getVoterCodePepper(): string | null {
  const pepper = process.env.OPENVOTE_CODE_PEPPER?.trim() ?? "";
  return pepper.length >= 32 ? pepper : null;
}
