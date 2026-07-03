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

export async function createReceiptHash({
  electionId,
  selectedCandidate,
  salt,
}: {
  electionId: string;
  selectedCandidate: string;
  salt: string;
}) {
  return sha256Hex(`${electionId}|${selectedCandidate}|${salt}`);
}

export async function createVoteReceipt({
  electionId,
  selectedCandidate,
}: {
  electionId: string;
  selectedCandidate: string;
}) {
  const salt = createSalt();
  const receiptHash = await createReceiptHash({
    electionId,
    selectedCandidate,
    salt,
  });

  return { salt, receiptHash };
}

export async function createDatabaseChainHash(
  electionId: string,
  ballot: PublicLedgerBallot,
) {
  return sha256Hex(
    [
      electionId,
      ballot.sequence_number,
      ballot.selected_candidate,
      ballot.receipt_hash,
      ballot.previous_chain_hash ?? "GENESIS",
    ].join("|"),
  );
}

export async function verifyLedgerChain(
  electionId: string,
  ballots: PublicLedgerBallot[],
) {
  let previous: string | null = null;

  for (const ballot of ballots) {
    if (ballot.previous_chain_hash !== previous) {
      return {
        valid: false,
        brokenAt: ballot.sequence_number,
        reason: "previous_chain_hash 불일치",
      };
    }

    const expected = await createDatabaseChainHash(electionId, ballot);
    if (expected !== ballot.chain_hash) {
      return {
        valid: false,
        brokenAt: ballot.sequence_number,
        reason: "chain_hash 불일치",
      };
    }

    previous = ballot.chain_hash;
  }

  return { valid: true, brokenAt: null, reason: null };
}

export function normalizeReceiptInput(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, "");
}
