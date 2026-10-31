import { createHmac, timingSafeEqual } from "node:crypto";
export const VIEW_TTL_SECONDS = 12 * 60 * 60;
export function viewCookieName(id: string) { return `moai_view_${id.replaceAll("-", "")}`; }
function signature(id: string, expiry: string, secret: string) {
  return createHmac("sha256", secret).update(`moai-election-view-v1\n${id}\n${expiry}`).digest("hex");
}
export function makeViewToken(id: string, secret: string, now = Date.now()) {
  const expiry = String(Math.floor(now / 1000) + VIEW_TTL_SECONDS);
  return `${expiry}.${signature(id, expiry, secret)}`;
}
export function validViewToken(token: string, id: string, secret: string, now = Date.now()) {
  const match = /^(\d{10,12})\.([a-f0-9]{64})$/.exec(token);
  if (!match || Number(match[1]) <= Math.floor(now / 1000)) return false;
  return timingSafeEqual(Buffer.from(match[2], "hex"), Buffer.from(signature(id, match[1], secret), "hex"));
}
