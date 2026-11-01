import type { AuditReceipt } from "./native-audit.ts";
/** 선택 내용은 저장하지 않고, 탭을 닫으면 영수증도 사라지도록 한다. */
export const RECEIPT_STORAGE_KEY = "open_vote_last_receipt";

export type SavedReceipt = {
  audit?: AuditReceipt;
  electionId: string;
  electionName: string;
  salt: string;
  receiptHash: string;
  contextHash?: string;
  checkpoint?: { ledgerHash: string; contextHash: string; ballotCount: number };
};

/** 브라우저에 남은 값은 JSON 형식과 필수 항목을 확인한 뒤 표시한다. */
export function parseSavedReceipt(raw: string | null): SavedReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.electionId !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(record.electionId) ||
      typeof record.receiptHash !== "string" ||
      !/^[a-f0-9]{64}$/i.test(record.receiptHash) ||
      typeof record.salt !== "string" ||
      !/^[a-f0-9]{64}$/i.test(record.salt)
    ) return null;
    if (record.contextHash !== undefined && (typeof record.contextHash !== "string" || !/^[a-f0-9]{64}$/i.test(record.contextHash))) return null;
    let checkpoint: SavedReceipt["checkpoint"];
    if (record.checkpoint !== undefined) {
      const point = record.checkpoint as SavedReceipt["checkpoint"];
      if (!point || typeof point !== "object" || !/^[a-f0-9]{64}$/.test(point.ledgerHash) || !/^[a-f0-9]{64}$/.test(point.contextHash) || !Number.isSafeInteger(point.ballotCount) || point.ballotCount < 0) return null;
      checkpoint = { ledgerHash: point.ledgerHash, contextHash: point.contextHash, ballotCount: point.ballotCount };
    }
    if (record.audit !== undefined) {
      const a = record.audit as AuditReceipt;
      if (!a || !/^[a-f0-9]{64}$/.test(a.secret) || !/^[a-f0-9]{64}$/.test(a.commitment) || a.manifest?.payload?.format !== "moai-manifest-v1" || a.manifest.payload.election.id !== record.electionId) return null;
    }
    return {
      ...(record.audit ? { audit: record.audit as AuditReceipt } : {}),
      electionId: record.electionId,
      electionName: typeof record.electionName === "string" ? record.electionName : "",
      receiptHash: record.receiptHash.toLowerCase(),
      salt: record.salt.toLowerCase(),
      ...(record.contextHash ? { contextHash: (record.contextHash as string).toLowerCase() } : {}),
      ...(checkpoint ? { checkpoint } : {}),
    };
  } catch {
    return null;
  }
}

/** 선택한 항목을 유추할 수 있는 공개 표 식별자와 비밀값이 없는 공유 방어형 확인증. */
export type PrivacyReceipt = {
  format: "moai-inclusion-receipt-v1";
  electionId: string;
  electionName: string;
  audit: Pick<AuditReceipt, "commitment" | "manifest" | "witness">;
};

export type ProtectedReceipt = Omit<PrivacyReceipt, "format"> & {
  format: "moai-protected-receipt-v2";
  encrypted: {
    kdf: "PBKDF2-SHA256";
    rounds: 310000;
    salt: string;
    cipher: "AES-256-GCM";
    iv: string;
    data: string;
  };
};

export type VerificationReceipt = SavedReceipt | PrivacyReceipt | ProtectedReceipt;

/** 공개 원장이 평문 표와 영수증 해시를 연결하므로, 그 해시·Salt·secret은 내보내지 않는다. */
export function toPrivacyReceipt(receipt: SavedReceipt): PrivacyReceipt {
  if (!receipt.audit) throw new Error("접수 약정이 없는 이전 영수증은 보호형 파일로 만들 수 없습니다.");
  const original = receipt.audit.manifest;
  const manifest = original.payload;
  const election = manifest.election;
  // 서버/저장소 객체를 통째로 복사하지 않는다. 예상하지 못한 private 필드도 유출되지 않게 허용 필드만 직렬화한다.
  const publicKey = manifest.publicKey;
  const safeManifest: AuditReceipt["manifest"] = {
    keyId: original.keyId,
    signature: original.signature,
    payload: {
      format: "moai-manifest-v1",
      election: {
        id: election.id,
        name: election.name,
        description: election.description,
        candidates: election.candidates.map(candidate => ({
          id: candidate.id,
          name: candidate.name,
          ...(candidate.description !== undefined ? { description: candidate.description } : {}),
        })),
        ballot_type: election.ballot_type,
        min_choices: election.min_choices,
        max_choices: election.max_choices,
        allow_blank: election.allow_blank,
        starts_at: election.starts_at,
        ends_at: election.ends_at,
      },
      electorate: manifest.electorate,
      smsRequired: manifest.smsRequired,
      singleCast: true,
      publicKey: { kty: publicKey.kty, crv: publicKey.crv, x: publicKey.x, y: publicKey.y,
        ...(publicKey.ext !== undefined ? { ext: publicKey.ext } : {}),
        ...(publicKey.key_ops !== undefined ? { key_ops: publicKey.key_ops } : {}) },
      keyId: manifest.keyId,
    },
  };
  const originalWitness = receipt.audit.witness;
  const safeWitness: AuditReceipt["witness"] = originalWitness ? {
    keyId: originalWitness.keyId,
    signature: originalWitness.signature,
    payload: {
      format: originalWitness.payload.format,
      electionId: originalWitness.payload.electionId,
      manifestHash: originalWitness.payload.manifestHash,
      index: originalWitness.payload.index,
      kind: originalWitness.payload.kind,
      payload: { commitment: receipt.audit.commitment },
      previous: originalWitness.payload.previous,
      head: originalWitness.payload.head,
    },
  } : undefined;
  return {
    format: "moai-inclusion-receipt-v1",
    electionId: receipt.electionId,
    electionName: receipt.electionName,
    audit: {
      commitment: receipt.audit.commitment,
      manifest: safeManifest,
      witness: safeWitness,
    },
  };
}

export function parseVerificationReceipt(raw: string | null): VerificationReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value) && "format" in value) {
      const r = value as Record<string, unknown>;
      if (!["moai-inclusion-receipt-v1", "moai-protected-receipt-v2"].includes(String(r.format)) ||
        typeof r.electionId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(r.electionId) ||
        typeof r.electionName !== "string" || !r.audit || typeof r.audit !== "object" || Array.isArray(r.audit)) return null;
      const a = r.audit as Record<string, unknown>;
      if (typeof a.commitment !== "string" || !/^[a-f0-9]{64}$/.test(a.commitment) ||
        !a.manifest || typeof a.manifest !== "object" || (a.witness !== undefined && (!a.witness || typeof a.witness !== "object"))) return null;
      const manifest = a.manifest as AuditReceipt["manifest"];
      const witness = a.witness as AuditReceipt["witness"];
      if (manifest.payload?.format !== "moai-manifest-v1" || manifest.payload.election?.id !== r.electionId ||
        (witness !== undefined && (witness.payload?.kind !== "vote" || witness.payload.electionId !== r.electionId ||
        witness.payload.payload?.commitment !== a.commitment))) return null;
      if (r.format === "moai-protected-receipt-v2") {
        const encrypted = r.encrypted as ProtectedReceipt["encrypted"] | undefined;
        if (!encrypted || encrypted.kdf !== "PBKDF2-SHA256" || encrypted.rounds !== 310000 ||
          encrypted.cipher !== "AES-256-GCM" || !/^[a-f0-9]{32}$/.test(encrypted.salt) ||
          !/^[a-f0-9]{24}$/.test(encrypted.iv) ||
          typeof encrypted.data !== "string" || !/^[A-Za-z0-9_-]{40,10000}$/.test(encrypted.data)) return null;
        return {
          format: "moai-protected-receipt-v2", electionId: r.electionId,
          electionName: r.electionName, audit: { commitment: a.commitment, manifest, witness },
          encrypted: { kdf: encrypted.kdf, rounds: encrypted.rounds, cipher: encrypted.cipher,
            salt: encrypted.salt, iv: encrypted.iv, data: encrypted.data },
        };
      }
      return {
        format: "moai-inclusion-receipt-v1",
        electionId: r.electionId,
        electionName: r.electionName,
        audit: { commitment: a.commitment, manifest, witness },
      };
    }
  } catch { return null; }
  return parseSavedReceipt(raw);
}

export function isProtectedReceipt(receipt: VerificationReceipt): receipt is ProtectedReceipt {
  return "format" in receipt && receipt.format === "moai-protected-receipt-v2";
}

export function isPrivacyReceipt(receipt: VerificationReceipt): receipt is PrivacyReceipt {
  return "format" in receipt && receipt.format === "moai-inclusion-receipt-v1";
}

export function formatReceiptForCopy(receipt: SavedReceipt) {
  if (receipt.audit) return JSON.stringify(toPrivacyReceipt(receipt));
  return [
    `election_id=${receipt.electionId}`,
    `receipt_hash=${receipt.receiptHash}`,
    `salt=${receipt.salt}`,
    ...(receipt.contextHash ? [`context_hash=${receipt.contextHash}`] : []),
    ...(receipt.checkpoint ? [`checkpoint=${JSON.stringify(receipt.checkpoint)}`] : []),
  ].join("\n");
}

/** 짧은 표시는 파일 식별용이며 원본 복구 키나 보안 증명이 아니다. */
export function receiptLabel(receipt: SavedReceipt) {
  return receipt.receiptHash.slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
}
