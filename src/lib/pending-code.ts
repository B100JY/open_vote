"use client";

/**
 * 홈·투표 안내 화면에서 입력한 투표 코드를 /c 화면으로 넘기는 메모리 보관함.
 * 주소(쿼리)나 브라우저 저장소에 남기지 않으려고 모듈 변수에만 둔다. 새로고침하면 다시 입력한다.
 */
let pending: string | null = null;

export function setPendingCode(code: string) {
  pending = code;
}

export function takePendingCode(): string | null {
  const code = pending;
  pending = null;
  return code;
}
