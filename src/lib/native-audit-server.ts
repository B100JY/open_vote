import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { canonical, hashObject, verifySignature, type Manifest, type Signed, type AuditEvent, type AuditBundle } from "./native-audit";

export function auditSigner() {
  const raw = process.env.MOAI_AUDIT_PRIVATE_JWK;
  if (!raw) throw new Error("감사 서명키가 설정되지 않았습니다.");
  const jwk = JSON.parse(raw);
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d) throw new Error("감사 서명키 형식이 올바르지 않습니다.");
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const publicKey = createPublicKey(key).export({ format: "jwk" });
  const keyId = createHash("sha256").update(canonical(publicKey)).digest("hex");
  return { publicKey, keyId, seal<T>(payload: T): Signed<T> { return { payload, keyId, signature: sign("sha256", Buffer.from(canonical(payload)), { key, dsaEncoding: "ieee-p1363" }).toString("hex") }; } };
}

/** 확정 RPC/이벤트에서만 호출한다. 저장된 최초 서명을 우선 반환한다. */
export async function sealCommitted<T>(electionId: string, index: number, payload: T, manifest: Manifest) {
  const db = getServiceDbSupabase();
  const { data: stored, error } = await db.from("audit_seals").select("envelope").eq("election_id", electionId).eq("index", index).maybeSingle();
  if (error) throw new Error("서명 자료를 조회하지 못했습니다.");
  if (stored) {
    const s = stored.envelope as Signed<T>;
    if (canonical(s.payload) !== canonical(payload) || !await verifySignature(s, manifest)) throw new Error("보관한 서명이 일치하지 않습니다.");
    return s;
  }
  const signer = auditSigner();
  if (signer.keyId !== manifest.keyId) throw new Error("선거 시작에 고정한 서명키를 사용할 수 없습니다.");
  const signed = signer.seal(payload);
  const { data, error: saveError } = await db.rpc("audit_save_seal", { p_election_id: electionId, p_index: index, p_envelope: signed });
  if (saveError) throw new Error("접수는 유지되지만 확인증 서명을 준비하지 못했습니다.");
  const result = data as Signed<T>;
  if (!await verifySignature(result, manifest)) throw new Error("저장한 서명 검증에 실패했습니다.");
  return result;
}
export async function loadAudit(electionId: string) {
  const { data, error } = await getServiceDbSupabase().from("audit_elections").select("manifest,manifest_hash,head,height,final_event").eq("election_id", electionId).maybeSingle();
  if (error) throw new Error("감사 자료를 조회하지 못했습니다.");
  return data as { manifest: Manifest; manifest_hash: string; head: string; height: number; final_event: AuditEvent | null } | null;
}
export async function initializeAudit(electionId: string, smsRequired = false) {
  const signer = auditSigner();
  const { data, error } = await getServiceDbSupabase().rpc("audit_setup", { p_election_id: electionId, p_public_key: signer.publicKey, p_key_id: signer.keyId, p_sms_required: smsRequired });
  if (error) throw new Error("감사 설정을 고정하지 못했습니다. 투표 시작 전에 다시 확인해주세요.");
  return sealCommitted(electionId, 0, data as Manifest, data as Manifest);
}
export async function publicAudit(electionId: string, c?: string) {
  const a = await loadAudit(electionId);
  if (!a) return null;
  const manifest = await sealCommitted(electionId, 0, a.manifest, a.manifest);
  if (c) {
    const { data, error } = await getServiceDbSupabase().from("audit_events").select("event").eq("election_id", electionId).eq("commitment", c).maybeSingle();
    if (error) throw new Error("접수 자료 조회 실패");
    return { manifest, manifestHash: a.manifest_hash, witness: data ? await sealCommitted(electionId, (data.event as AuditEvent).index, data.event as AuditEvent, a.manifest) : null };
  }
  const { data: last, error: lastError } = a.height ? await getServiceDbSupabase().from("audit_events").select("event").eq("election_id", electionId).eq("index", a.height).single() : { data: null, error: null };
  if (lastError) throw new Error("기준점 자료 조회 실패");
  const checkpoint = last ? await sealCommitted(electionId, a.height, last.event as AuditEvent, a.manifest) : null;
  return { manifest, manifestHash: a.manifest_hash, head: a.head, height: a.height, checkpoint };
}
export async function auditBundle(electionId: string): Promise<AuditBundle> {
  const db = getServiceDbSupabase();
  const { error: closeError } = await db.rpc("close_expired_elections");
  if (closeError) throw new Error("마감 상태를 확인하지 못했습니다.");
  const a = await loadAudit(electionId);
  if (!a?.final_event) throw new Error("마감 후 최종 검증 자료를 받을 수 있습니다.");
  const [ledgerResult, tallyResult] = await Promise.all([db.rpc("get_public_ballot_ledger", { p_election_id: electionId }), db.rpc("get_election_results", { p_election_id: electionId })]);
  if (ledgerResult.error || tallyResult.error || !ledgerResult.data?.success || !tallyResult.data?.success) throw new Error("최종 자료가 준비되지 않았습니다.");
  const events: AuditEvent[] = [];
  for (let from = 0; from < a.height; from += 500) {
    const { data, error } = await db.from("audit_events").select("event").eq("election_id", electionId).order("index").range(from, Math.min(from + 499, a.height - 1));
    if (error || !data?.length) throw new Error("이력 자료가 불완전합니다.");
    events.push(...data.map(row => row.event as AuditEvent));
  }
  const ledger = { ...ledgerResult.data }; delete ledger.success;
  const results = { ...tallyResult.data }; delete results.success;
  if (events.length !== a.height || a.final_event.payload.resultHash !== await hashObject(results)) throw new Error("마감 기준점과 현재 결과가 다릅니다.");
  return { format: "moai-audit-bundle-v1", manifest: await sealCommitted(electionId, 0, a.manifest, a.manifest), events, ledger, results, final: await sealCommitted(electionId, a.height, a.final_event, a.manifest) };
}
