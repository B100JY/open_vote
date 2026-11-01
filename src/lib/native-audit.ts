import canonicalize from "canonicalize";
import type { VerificationReceipt } from "./vote-receipt.ts";
import type { Election, ElectionResults, PublicBallotLedger, CandidateResult } from "./types.ts";

export const HEX = /^[a-f0-9]{64}$/;
export type Manifest = {
  format: "moai-manifest-v1";
  election: Pick<Election, "id" | "name" | "description" | "candidates" | "ballot_type" | "min_choices" | "max_choices" | "allow_blank" | "starts_at" | "ends_at">;
  electorate: number;
  smsRequired: boolean;
  singleCast: true;
  publicKey: JsonWebKey;
  keyId: string;
};
export type AuditEvent = { format: "moai-event-v1"; electionId: string; manifestHash: string; index: number; kind: "vote" | "schedule" | "final"; payload: Record<string, string | number>; previous: string; head: string };
export type Signed<T> = { payload: T; signature: string; keyId: string };
export type AuditReceipt = { secret: string; commitment: string; manifest: Signed<Manifest>; witness?: Signed<AuditEvent> };
export type AuditBundle = { format: "moai-audit-bundle-v1"; manifest: Signed<Manifest>; events: AuditEvent[]; ledger: PublicBallotLedger; results: ElectionResults; final: Signed<AuditEvent> };
export type AuditAnchor = Signed<Manifest> | { manifest: Signed<Manifest>; checkpoint: Signed<AuditEvent> | null };
export type AuditCheck = { check: string; status: "PASS" | "FAIL" | "UNCONFIRMED"; detail: string };

export function canonical(value: unknown): string {
  const encoded = canonicalize(value);
  if (typeof encoded !== "string") throw new Error("정규화할 수 없는 자료입니다.");
  return encoded;
}
export async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, "0")).join("");
}
export const hashObject = (value: unknown) => digest(canonical(value));
export function newSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, "0")).join(""); }
export async function commitment(electionId: string, manifestHash: string, receiptHash: string, secret: string) {
  if (![manifestHash, receiptHash, secret].every(x => HEX.test(x))) throw new Error("약정 형식이 올바르지 않습니다.");
  return hashObject({ domain: "moai-commit-v1", electionId, manifestHash, receiptHash, secret });
}
export async function eventHead(event: AuditEvent) {
  const body = { ...event } as Partial<AuditEvent>;
  delete body.head;
  return hashObject(body);
}
export async function verifySignature<T>(signed: Signed<T>, manifest: Manifest) {
  try {
    if (signed.keyId !== manifest.keyId || !/^[a-f0-9]{128}$/.test(signed.signature)) return false;
    const key = await crypto.subtle.importKey("jwk", manifest.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const bytes = new Uint8Array(signed.signature.match(/../g)!.map(x => parseInt(x, 16)));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytes, new TextEncoder().encode(canonical(signed.payload)));
  } catch { return false; }
}

/** 서버의 normalize_ballot_selection/집계 RPC를 호출하지 않는 별도 공개 자료 집계기. */
export function recount(manifest: Manifest, ballots: PublicBallotLedger["ballots"]): ElectionResults {
  const e = manifest.election;
  const ids = e.candidates.map(c => c.id);
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !/^[A-Za-z0-9_-]{1,64}$/.test(id) || id === "BLANK") || !["single", "multi", "rank", "approve"].includes(e.ballot_type) || !Number.isSafeInteger(e.min_choices) || !Number.isSafeInteger(e.max_choices) || e.min_choices < 1 || e.max_choices < e.min_choices || e.max_choices > ids.length) throw new Error("투표 규칙이 올바르지 않습니다.");
  const votes = ids.map(() => 0), yes = [...votes], no = [...votes], points = [...votes];
  const ranks = ids.map(() => Array.from({ length: e.max_choices }, () => 0));
  let blank = 0;
  for (const ballot of ballots) {
    const s = ballot.selection;
    if (s === "BLANK") { if (!e.allow_blank) throw new Error("허용되지 않은 기권입니다."); blank++; continue; }
    if (e.ballot_type === "approve") {
      const parts = s.split(",");
      if (parts.length !== ids.length) throw new Error("불완전한 찬반 표입니다.");
      parts.forEach((part, i) => { if (part === `${ids[i]}:yes`) yes[i]++; else if (part === `${ids[i]}:no`) no[i]++; else throw new Error("찬반 표가 정규 형식과 다릅니다."); });
      continue;
    }
    const picked = s.split(e.ballot_type === "rank" ? ">" : ",");
    if (new Set(picked).size !== picked.length || picked.some(id => !ids.includes(id)) || (e.ballot_type === "single" ? picked.length !== 1 : picked.length < e.min_choices || picked.length > e.max_choices)) throw new Error("선택 규칙을 위반한 표입니다.");
    if (e.ballot_type !== "rank" && ids.filter(id => picked.includes(id)).join(",") !== s) throw new Error("표의 정렬이 정규 형식과 다릅니다.");
    picked.forEach((id, r) => { const i = ids.indexOf(id); votes[i]++; if (e.ballot_type === "rank") { points[i] += e.max_choices - r; ranks[i][r]++; } });
  }
  const valid = ballots.length - blank;
  const pct = (n: number, d: number) => d ? Math.round(n * 10000 / d) / 100 : 0;
  const candidates: CandidateResult[] = ids.map((id, i) => e.ballot_type === "approve" ? { candidate_id: id, yes: yes[i], no: no[i], yes_percentage: pct(yes[i], yes[i] + no[i]) } : e.ballot_type === "rank" ? { candidate_id: id, votes: votes[i], first_choice: ranks[i][0], points: points[i], rank_counts: votes[i] ? ranks[i] : [], percentage: pct(ranks[i][0], valid) } : { candidate_id: id, votes: votes[i], percentage: pct(votes[i], valid) });
  return { election_id: e.id, ballot_type: e.ballot_type, min_choices: e.min_choices, max_choices: e.max_choices, total_ballots: ballots.length, blank_ballots: blank, valid_ballots: valid, candidates };
}

export async function verifyBundle(bundle: AuditBundle, receipt?: VerificationReceipt, anchor?: AuditAnchor): Promise<AuditCheck[]> {
  const checks: AuditCheck[] = [];
  const add = (check: string, ok: boolean, detail: string) => checks.push({ check, status: ok ? "PASS" : "FAIL", detail });
  try {
    if (bundle.format !== "moai-audit-bundle-v1" || bundle.manifest.payload.format !== "moai-manifest-v1" || bundle.events.length > 100_001 || bundle.ledger.ballots.length > 100_000) throw new Error("지원하지 않는 자료 형식/크기입니다.");
    const m = bundle.manifest.payload, mh = await hashObject(m);
    const external = anchor && "manifest" in anchor ? anchor : undefined;
    const trusted = external?.manifest ?? (anchor && "payload" in anchor ? anchor : undefined) ?? receipt?.audit?.manifest;
    if (!anchor && receipt?.audit) checks.push({ check: "PRESTART_INDEPENDENT_ANCHOR", status: "UNCONFIRMED", detail: "개인 확인증에 보관한 규칙을 기준으로 비교합니다. 개시 전 별도 경로에서 확인한 것은 아닙니다." });
    if (trusted) add("MANIFEST_ANCHOR", canonical(trusted.payload) === canonical(m) && await verifySignature(trusted, trusted.payload), "보관한 시작 규칙·키와 비교");
    else checks.push({ check: "MANIFEST_ANCHOR", status: "UNCONFIRMED", detail: "최초 규칙·공개키의 독립 사본을 제시하지 않았습니다." });
    add("MANIFEST_SIGNATURE", await verifySignature(bundle.manifest, m), "제공된 시작 공개키에 대한 서명 확인");
    let previous = mh;
    const commitments = new Set<string>();
    for (const [i, event] of bundle.events.entries()) {
      if (event.format !== "moai-event-v1" || event.electionId !== m.election.id || event.manifestHash !== mh || event.index !== i + 1 || event.previous !== previous || event.head !== await eventHead(event) || (i === bundle.events.length - 1 ? event.kind !== "final" : !["vote","schedule"].includes(event.kind))) throw new Error("체인 연결·이벤트가 올바르지 않습니다.");
      if (event.kind === "schedule") { const start = event.payload.startsAt; if (commitments.size || typeof start !== "string" || !Number.isFinite(Date.parse(start)) || (m.election.ends_at && Date.parse(start) >= Date.parse(m.election.ends_at)) || canonical(event.payload) !== canonical({startsAt:start})) throw new Error("시작일 변경 기록이 올바르지 않습니다."); }
      if (event.kind === "vote") { const c = event.payload.commitment; if (typeof c !== "string" || !HEX.test(c) || commitments.has(c) || canonical(event.payload) !== canonical({ commitment: c })) throw new Error("약정 중복/비공개 필드가 있습니다."); commitments.add(c); }
      previous = event.head;
    }
    const last = bundle.events.at(-1);
    if (!last || canonical(last) !== canonical(bundle.final.payload)) throw new Error("최종 기준점이 체인과 다릅니다.");
    add("FINAL_SIGNATURE", await verifySignature(bundle.final, m), "최종 공개본 서명");
    if (external?.checkpoint) {
      const saved = external.checkpoint;
      const valid = await verifySignature(saved, m) && saved.payload.electionId === m.election.id && saved.payload.manifestHash === mh && saved.payload.head === await eventHead(saved.payload);
      const same = canonical(bundle.events.find(e => e.index === saved.payload.index) ?? null) === canonical(saved.payload);
      add(valid && !same ? "SIGNED_HISTORY_CONFLICT" : "EXTERNAL_CHECKPOINT", valid && same, "별도 보관한 원장 기준점과 최종 이력 비교");
    }
    const sorted = [...bundle.ledger.ballots].sort((a, b) => a.receipt_hash < b.receipt_hash ? -1 : a.receipt_hash > b.receipt_hash ? 1 : 0);
    if (bundle.ledger.election_id !== m.election.id || sorted.some(b => !HEX.test(b.receipt_hash)) || new Set(sorted.map(b => b.receipt_hash)).size !== sorted.length) throw new Error("공개 표 식별값이 잘못되었거나 중복입니다.");
    const ledgerHash = await digest(sorted.map(b => `${b.receipt_hash}:${b.selection}`).join("\n"));
    const setHash = await hashObject([...commitments].sort());
    add("HISTORY_AND_LEDGER", bundle.ledger.ledger_hash === ledgerHash && bundle.ledger.ballot_count === sorted.length && commitments.size === sorted.length && sorted.length <= m.electorate && last.payload.ledgerHash === ledgerHash && last.payload.commitmentHash === setHash && last.payload.ballotCount === sorted.length && last.payload.resultHash === await hashObject(bundle.results), "서명된 기록·개수·결과 대조");
    const expected = recount(m, sorted);
    const published = { ...bundle.results } as ElectionResults & { success?: boolean };
    delete published.success;
    add("TALLY_RECOUNT", canonical(expected) === canonical(published), "공개 표를 별도 구현으로 재계산");
    if (receipt?.audit) {
      const a = receipt.audit;
      const privacy = "format" in receipt;
      const c = privacy ? a.commitment : await commitment(receipt.electionId, mh, receipt.receiptHash, receipt.audit!.secret);
      add("OWN_COMMITMENT", receipt.electionId === m.election.id && c === a.commitment && commitments.has(c), privacy ? "서명된 접수 약정의 공개 기록 포함 확인" : "로컬 비밀값과 약정 포함 확인");
      if (privacy) {
        checks.push({ check: "OWN_BALLOT", status: "UNCONFIRMED", detail: "개인정보 보호형 확인증에는 선택과 연결되는 값이 없어 내 선택 내용 자체는 대조할 수 없습니다." });
      } else {
        const mine = sorted.find(b => b.receipt_hash === receipt.receiptHash);
        add("OWN_BALLOT", !!mine && await digest(`${receipt.electionId}|${mine.selection}|${receipt.salt}`) === receipt.receiptHash, "내 공개 표와 영수증 대조");
      }
      if (a.witness) {
        const ev = bundle.events.find(e => e.index === a.witness!.payload.index);
        const valid = await verifySignature(a.witness, m) && a.witness.payload.head === await eventHead(a.witness.payload) && a.witness.payload.payload.commitment === c && a.witness.payload.electionId === m.election.id && a.witness.payload.manifestHash === mh && a.witness.payload.kind === "vote";
        add(valid && canonical(ev ?? null) !== canonical(a.witness.payload) ? "SIGNED_HISTORY_CONFLICT" : "OWN_WITNESS", valid && canonical(ev ?? null) === canonical(a.witness.payload), "보관한 접수 서명과 최종 이력 대조");
      } else checks.push({ check: "OWN_WITNESS", status: "UNCONFIRMED", detail: "접수 서명을 아직 보관하지 않았습니다." });
    }
    checks.push({ check: "PRECAST_AUTH_DECLARED", status: "UNCONFIRMED", detail: m.smsRequired ? "문자 인증 필수로 선언됨. 실제 전원 수행의 공개 증명은 아닙니다." : "추가 문자 인증 해제. 기본 자격 검사는 유지됩니다." });
    checks.push({ check: "ELIGIBILITY_AND_CORRESPONDENCE", status: "UNCONFIRMED", detail: "실제 적격자의 의사·약정과 전체 평문 표의 일대일 대응은 증명하지 않습니다." });
  } catch (error) { checks.push({ check: "BUNDLE_INTEGRITY", status: "FAIL", detail: error instanceof Error ? error.message : "자료를 읽지 못했습니다." }); }
  return checks;
}
