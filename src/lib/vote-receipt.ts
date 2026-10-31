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

export function formatReceiptForCopy(receipt: SavedReceipt) {
  if (receipt.audit) return JSON.stringify(receipt);
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
