import { parseSavedReceipt, toPrivacyReceipt, type ProtectedReceipt, type SavedReceipt } from "./vote-receipt.ts";

const rounds = 310000;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const unhex = (value: string) => new Uint8Array(value.match(/../g)!.map(byte => parseInt(byte, 16)));
const toBase64url = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (value: string) => new Uint8Array(Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));

async function keyFromPassword(password: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: rounds, hash: "SHA-256" }, passwordKey,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function associatedData(electionId: string, commitment: string) {
  return encoder.encode(`moai-protected-receipt-v2|${electionId}|${commitment}`);
}

/** 암호는 업로드·저장하지 않는다. 오직 브라우저 WebCrypto에서 개인 식별값을 잠글 때 쓴다. */
export async function protectReceipt(receipt: SavedReceipt, password: string): Promise<ProtectedReceipt> {
  if (password.length < 4 || password.length > 256) throw new Error("영수증 암호를 4자 이상 입력해 주세요.");
  if (!receipt.audit) throw new Error("서명 감사 영수증만 암호화할 수 있습니다.");
  const publicPart = toPrivacyReceipt(receipt);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = encoder.encode(JSON.stringify({
    receiptHash: receipt.receiptHash, salt: receipt.salt, secret: receipt.audit.secret,
    ...(receipt.contextHash ? { contextHash: receipt.contextHash } : {}),
  }));
  const key = await keyFromPassword(password, salt);
  const ciphertext = await crypto.subtle.encrypt({
    name: "AES-GCM", iv: iv as BufferSource,
    additionalData: associatedData(receipt.electionId, receipt.audit.commitment) as BufferSource,
  }, key, payload);
  return {
    ...publicPart, format: "moai-protected-receipt-v2",
    encrypted: { kdf: "PBKDF2-SHA256", rounds, salt: hex(salt), cipher: "AES-256-GCM", iv: hex(iv),
      data: toBase64url(new Uint8Array(ciphertext)) },
  };
}

/** 잠금을 풀면 기존 verifyBundle의 OWN_BALLOT을 포함한 모든 검증을 그대로 수행한다. */
export async function unlockReceipt(protectedReceipt: ProtectedReceipt, password: string): Promise<SavedReceipt> {
  if (!password) throw new Error("영수증 암호를 입력해 주세요.");
  try {
    const locked = protectedReceipt.encrypted;
    const key = await keyFromPassword(password, unhex(locked.salt));
    const plain = await crypto.subtle.decrypt({
      name: "AES-GCM", iv: unhex(locked.iv) as BufferSource,
      additionalData: associatedData(protectedReceipt.electionId, protectedReceipt.audit.commitment) as BufferSource,
    }, key, fromBase64url(locked.data) as BufferSource);
    const privateData = JSON.parse(new TextDecoder().decode(plain)) as {
      receiptHash: string; salt: string; secret: string; contextHash?: string;
    };
    const raw = parseSavedReceipt(JSON.stringify({
      electionId: protectedReceipt.electionId, electionName: protectedReceipt.electionName,
      receiptHash: privateData.receiptHash, salt: privateData.salt,
      ...(privateData.contextHash ? { contextHash: privateData.contextHash } : {}),
      audit: { ...protectedReceipt.audit, secret: privateData.secret },
    }));
    if (!raw?.audit) throw new Error("invalid");
    return raw;
  } catch {
    throw new Error("암호가 틀렸거나 확인증 파일이 변경되었습니다.");
  }
}
