import type { SavedReceipt } from "./vote-receipt.ts";
import { parseSavedReceipt } from "./vote-receipt.ts";
import type { BallotRules, Candidate, Election, PublicBallotLedger } from "./types.ts";

export type AuditElection = BallotRules & { id: string; name: string; description: string | null; candidates: Candidate[] };
export type AuditRecord = { format: "moai-public-record-v1"; election: AuditElection & { status: "closed" }; ledger: PublicBallotLedger };
export type AuditResult = { valid: boolean; message: string; ledgerHash?: string; contextHash?: string; ballotCount?: number };

export function makeAuditRecord(election: Election, ledger: PublicBallotLedger): AuditRecord {
  if (election.status !== "closed" || election.id !== ledger.election_id) throw new Error("마감한 투표의 기록만 저장할 수 있습니다.");
  return { format: "moai-public-record-v1", election: {
    id: election.id, name: election.name, description: election.description, candidates: election.candidates,
    ballot_type: election.ballot_type, min_choices: election.min_choices, max_choices: election.max_choices,
    allow_blank: election.allow_blank, status: "closed",
  }, ledger: { election_id: ledger.election_id, ballot_count: ledger.ballot_count, ledger_hash: ledger.ledger_hash,
    ballots: ledger.ballots.map(ballot => ({ receipt_hash: ballot.receipt_hash, selection: ballot.selection })) } };
}

/** 같은 함수를 저장 HTML에 넣는다. 외부 변수·통신·라이브러리에 의존하지 않는다. */
export async function auditReceiptEvidence(receipt: SavedReceipt, record: unknown): Promise<AuditResult> {
  // 이 함수의 모든 보조 함수는 내부에 둔다. 저장 영수증의 오프라인 검증과 웹 검증이 같은 코드다.
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("파일 형식을 확인해주세요.");
    return value as Record<string, unknown>;
  };
  const hex = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
  try {
    const data = object(record);
    if (data.format !== "moai-public-record-v1") throw new Error("모아이투표 기록 파일이 아닙니다.");
    const election = object(data.election);
    const ledger = object(data.ledger);
    if (election.id !== receipt.electionId || ledger.election_id !== receipt.electionId) throw new Error("다른 투표의 기록입니다.");
    if (election.status !== "closed") throw new Error("마감 후 공개된 기록으로 확인해주세요.");
    if (!hex(receipt.receiptHash) || !hex(receipt.salt) || (receipt.contextHash !== undefined && !hex(receipt.contextHash))) throw new Error("영수증 형식이 올바르지 않습니다.");
    if (!Array.isArray(ledger.ballots) || ledger.ballots.length > 100_000 || !hex(ledger.ledger_hash) || ledger.ballot_count !== ledger.ballots.length) throw new Error("투표 기록의 형식이나 표 개수가 올바르지 않습니다.");
    const ballots = ledger.ballots.map(value => {
      const ballot = object(value);
      if (!hex(ballot.receipt_hash) || typeof ballot.selection !== "string" || ballot.selection.length > 16_384) throw new Error("투표지 형식이 올바르지 않습니다.");
      return { receipt_hash: ballot.receipt_hash, selection: ballot.selection };
    });
    if (new Set(ballots.map(ballot => ballot.receipt_hash)).size !== ballots.length) throw new Error("같은 영수증이 중복되어 있습니다.");
    const lines = ballots.map(ballot => `${ballot.receipt_hash}:${ballot.selection}`).sort();
    const ledgerHash = await hash(lines.join("\n"));
    if (ledgerHash !== ledger.ledger_hash) throw new Error("기록과 공개 도장이 일치하지 않습니다.");
    const mine = ballots.find(ballot => ballot.receipt_hash === receipt.receiptHash);
    if (!mine) throw new Error("내 표가 기록에 없습니다. 다른 기록 파일인지 또는 누락되었는지 확인해주세요.");
    if (await hash(`${receipt.electionId}|${mine.selection}|${receipt.salt}`) !== receipt.receiptHash) throw new Error("내 표의 선택 내용이 영수증과 다릅니다. 변경 여부를 확인해주세요.");
    const contextHash = await hash(JSON.stringify({
      format: "moai-ballot-context-v1", id: election.id, name: election.name,
      description: election.description, candidates: Array.isArray(election.candidates) ? election.candidates.map(value => { const candidate = object(value); return { id: candidate.id, name: typeof candidate.name === "string" ? candidate.name.trim() : candidate.name, description: typeof candidate.description === "string" && candidate.description.trim() ? candidate.description : null }; }) : null,
      ballot_type: election.ballot_type, min_choices: election.min_choices,
      max_choices: election.max_choices, allow_blank: election.allow_blank,
    }));
    if (receipt.contextHash && receipt.contextHash !== contextHash) throw new Error("투표 당시의 제목·항목·방식과 현재 기록이 다릅니다.");
    if (receipt.checkpoint && (receipt.checkpoint.ledgerHash !== ledgerHash || receipt.checkpoint.contextHash !== contextHash || receipt.checkpoint.ballotCount !== ballots.length)) throw new Error("보관한 마감 기록과 현재 기록이 다릅니다. 표나 투표 항목의 변경 여부를 확인해주세요.");
    return { valid: true, message: receipt.checkpoint ? "내 표와 보관한 마감 기록이 모두 일치합니다." : "내 표의 선택 내용이 영수증과 일치합니다. 마감 기록도 영수증에 추가해 보관할 수 있습니다.", ledgerHash, contextHash, ballotCount: ballots.length };
  } catch (error) {
    return { valid: false, message: error instanceof Error ? error.message : "기록을 검증하지 못했습니다." };
  }
}

export async function electionContextHash(election: AuditElection) {
  const data = JSON.stringify({ format: "moai-ballot-context-v1", id: election.id, name: election.name,
    description: election.description, candidates: election.candidates.map(candidate => ({ id: candidate.id, name: candidate.name.trim(), description: typeof candidate.description === "string" && candidate.description.trim() ? candidate.description : null })), ballot_type: election.ballot_type,
    min_choices: election.min_choices, max_choices: election.max_choices, allow_blank: election.allow_blank });
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function withCheckpoint(receipt: SavedReceipt, result: AuditResult): SavedReceipt {
  if (!result.valid || !result.ledgerHash || !result.contextHash || result.ballotCount === undefined) throw new Error("검증된 기록만 보관할 수 있습니다.");
  if (receipt.checkpoint) {
    if (receipt.checkpoint.ledgerHash !== result.ledgerHash || receipt.checkpoint.contextHash !== result.contextHash || receipt.checkpoint.ballotCount !== result.ballotCount) throw new Error("기존 기준값을 다른 기록으로 덮어쓸 수 없습니다.");
    return receipt;
  }
  return { ...receipt, checkpoint: { ledgerHash: result.ledgerHash, contextHash: result.contextHash, ballotCount: result.ballotCount } };
}

export function parseReceiptFile(text: string): SavedReceipt | null {
  if (text.length > 1_000_000) return null;
  const embedded = /<script id="moai-receipt" type="application\/json">([\s\S]*?)<\/script>/.exec(text)?.[1];
  return parseSavedReceipt(embedded ?? text);
}
