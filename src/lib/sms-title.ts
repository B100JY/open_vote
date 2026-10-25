/**
 * 안내 문자 제목 — 투표 생성자가 고칠 수 있는 유일한 문구.
 * 본문 템플릿은 notifier 에 등록돼 있고 총괄관리자만 고친다.
 *
 * 제목은 문자 첫 줄에 들어가므로 피싱에 쓰이지 않게 링크·전화번호를 막고,
 * SMS(EUC-KR)로 보낼 수 없는 글자(이모지 등)를 막는다.
 */

export const SMS_TITLE_MAX = 30;

// 한글·한글 자모·ASCII 출력 문자·가운뎃점·따옴표만(EUC-KR 로 보낼 수 있는 범위로 좁힘)
const ALLOWED = /^[ -~가-힣ㄱ-ㆎ·“”‘’]+$/;
const LINK = /(https?:|www\.|[a-z0-9-]+\.(com|net|org|kr|io|me|ly|co|xyz|link|site|top|info|biz|shop|app|dev|to|gl|gd|cc)\b)/i;
const PHONE = /\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/;

export function defaultSmsTitle(electionName: string): string {
  const title = `${electionName.trim()} 투표 안내`;
  return title.length <= SMS_TITLE_MAX ? title : `${electionName.trim().slice(0, SMS_TITLE_MAX - 7)}… 투표 안내`;
}

export type SmsTitleCheck = { ok: true; value: string | null } | { ok: false; message: string };

/** 빈 값은 null(기본 제목 사용). */
export function checkSmsTitle(input: unknown): SmsTitleCheck {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, message: "문자 제목이 올바르지 않습니다." };
  const title = input.replace(/\s+/g, " ").trim();
  if (!title) return { ok: true, value: null };
  if (title.length > SMS_TITLE_MAX) return { ok: false, message: `문자 제목은 ${SMS_TITLE_MAX}자 이하로 써 주세요.` };
  if (!ALLOWED.test(title)) return { ok: false, message: "문자 제목에는 이모지나 특수 문자를 쓸 수 없습니다." };
  if (LINK.test(title)) return { ok: false, message: "문자 제목에는 링크나 주소를 넣을 수 없습니다." };
  if (PHONE.test(title)) return { ok: false, message: "문자 제목에는 전화번호를 넣을 수 없습니다." };
  return { ok: true, value: title };
}
