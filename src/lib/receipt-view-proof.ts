import {
  canonical, eventHead, hashObject, verifySignature,
  type AuditEvent, type Manifest, type Signed,
} from "./native-audit.ts";

/**
 * Possession of a previously signed ballot receipt is proof of voter status.
 * Validate only PUBLIC witness data; the receiptHash, salt, secret, password
 * and selection are never submitted to this endpoint.
 */
export async function validReceiptWitness(
  witness: Signed<AuditEvent>,
  manifest: Manifest,
  electionId: string,
  storedEvent: AuditEvent,
): Promise<boolean> {
  try {
    const e = witness.payload;
    if (!e || witness.keyId !== manifest.keyId ||
      e.format !== "moai-event-v1" || e.kind !== "vote" ||
      e.electionId !== electionId ||
      e.manifestHash !== await hashObject(manifest) ||
      !Number.isSafeInteger(e.index) || e.index < 1 || e.index > 100_000 ||
      typeof e.payload?.commitment !== "string" ||
      !/^[a-f0-9]{64}$/.test(e.payload.commitment) ||
      e.head !== await eventHead(e) ||
      canonical(e) !== canonical(storedEvent)) return false;

    return await verifySignature(witness, manifest);
  } catch {
    return false;
  }
}
