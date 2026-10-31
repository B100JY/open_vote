import { checkSmsTitle } from "./sms-title.ts";
import { EUC_KR_HANGUL, EUC_KR_OTHER } from "./sms-hangul.ts";

export type SmsFormat = "standard" | "compact";
export const COMPACT_TEMPLATE = "moai_vote_compact_v1";
export const COMPACT_URL = "https://vote.bluerdot.net/";
export const SMS_MAX_BYTES = 90;
const hangul = new Set(EUC_KR_HANGUL + EUC_KR_OTHER);
/** Python/provider EUC-KR와 같은 한글 2,350자만 허용한다. UTF-8 길이가 아니다. */
export function smsBytes(text: string): number | null {
  let bytes = 0;
  for (const c of text) {
    const n = c.codePointAt(0)!;
    if (n < 128) bytes++;
    else if (hangul.has(c)) bytes += 2;
    else return null;
  }
  return bytes;
}
export function compactMessage(title: string, code = "ABC-012") {
  return `[모아이투표] ${title}\n${COMPACT_URL}\n코드: ${code}`;
}
export function parseSmsFormat(value: unknown): SmsFormat | null {
  return value === undefined || value === "standard" ? "standard" : value === "compact" ? "compact" : null;
}
export function checkCompactTitle(value: unknown): { ok: true; value: string; bytes: number } | { ok: false; message: string } {
  const title = checkSmsTitle(value, 36);
  if (!title.ok) return title;
  if (!title.value) return { ok: false, message: "간편 SMS의 투표 제목을 입력해주세요." };
  const bytes = smsBytes(compactMessage(title.value));
  if (bytes === null) return { ok: false, message: "SMS로 보낼 수 없는 글자가 있습니다. 다른 제목을 입력해주세요." };
  if (bytes > SMS_MAX_BYTES) return { ok: false, message: `간편 SMS는 전체 ${SMS_MAX_BYTES}바이트 이하여야 합니다(현재 ${bytes}바이트). 제목을 줄여주세요.` };
  return { ok: true, value: title.value, bytes };
}
