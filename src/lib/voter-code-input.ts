/** 브라우저용 투표 코드 정규화(서버 voter-code.ts 와 같은 규칙, node 모듈 없이). */
const PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export function cleanCodeInput(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return PATTERN.test(code) ? code : null;
}
