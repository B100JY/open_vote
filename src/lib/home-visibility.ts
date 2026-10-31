/** 0일은 종료 직후 홈에서 숨김, 기본값은 7일. 소수·문자열·무제한 값은 허용하지 않는다. */
export function validHomeClosedDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 365;
}
