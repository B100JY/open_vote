import type { PublicLedgerBallot } from "@/lib/types";

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createSalt() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

/** 영수증 해시 = sha256(선거ID | 선택 정규 문자열 | salt). salt 는 유권자 기기에만 있다. */
export async function createReceiptHash({
  electionId,
  selection,
  salt,
}: {
  electionId: string;
  selection: string;
  salt: string;
}) {
  return sha256Hex(`${electionId}|${selection}|${salt}`);
}

export async function createVoteReceipt({
  electionId,
  selection,
}: {
  electionId: string;
  selection: string;
}) {
  const salt = createSalt();
  const receiptHash = await createReceiptHash({ electionId, selection, salt });
  return { salt, receiptHash };
}

/**
 * 공개 원장 해시 — DB `get_public_ballot_ledger` 와 같은 계산.
 * 영수증 해시 오름차순(바이트 순)으로 "receipt:selection" 줄을 \n 으로 이어 sha256.
 * 투표 순서 정보가 없으므로 원장을 공개해도 누가 언제 무엇을 찍었는지 이어지지 않는다.
 */
export async function computeLedgerHash(ballots: PublicLedgerBallot[]) {
  const lines = ballots
    .map((ballot) => `${ballot.receipt_hash}:${ballot.selection}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Hex(lines.join("\n"));
}

export async function verifyLedger(ballots: PublicLedgerBallot[], ledgerHash: string) {
  const receipts = ballots.map((ballot) => ballot.receipt_hash);
  if (new Set(receipts).size !== receipts.length) {
    return { valid: false, reason: "같은 영수증 해시가 두 번 있습니다" };
  }
  const expected = await computeLedgerHash(ballots);
  if (expected !== ledgerHash) {
    return { valid: false, reason: "원장 해시가 공개 값과 다릅니다" };
  }
  return { valid: true, reason: null };
}

export function normalizeReceiptInput(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, "");
}
