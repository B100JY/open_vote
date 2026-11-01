import { getServiceDbSupabase } from "@/lib/supabase/server";
import { getNotifierConfig, sendNotifierBatch, SimplyNotifierError, type NotifierRecipient, type NotifierRecipientResult } from "@/lib/simply-notifier";
import { defaultSmsTitle, checkSmsTitle } from "@/lib/sms-title";
import { COMPACT_TEMPLATE, checkCompactTitle, type SmsFormat } from "@/lib/sms-format";
import { getSmsPrices } from "@/lib/billing";
import { createVoterCode, formatVoterCode, getVoterCodePepper, hashVoterCode } from "@/lib/voter-code";
import { createVoterToken, hashVoterToken } from "@/lib/voter-token";

export type SmsInviteSummary = { requested: number; sent: number; failed: number; skipped: number; dryRun: boolean; batchId: string | null; results: NotifierRecipientResult[]; stopped: string | null; cost: number; refunded: number; resendCount?: number; uncertain: boolean };
export type SmsInviteResult = { ok: true; summary: SmsInviteSummary } | { ok: false; status: number; error: string; message: string };
type Voter = { id: string; phone: string; voter_name: string | null; invited_at: string | null };
type Options = { electionId: string; baseUrl: string; dryRun?: boolean; resendAll?: boolean; voterIds?: string[]; actorId: string; format?: SmsFormat; smsTitle?: string; kind?: "bulk" | "admin" | "self" };
export function getVoteLinkBaseUrl(request?: Request): string {
  return (process.env.VOTE_LINK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (request ? request.headers.get("origin") || new URL(request.url).origin : "")).replace(/\/+$/, "");
}
export function getNotifierChunkSize() {
  const n = Number(process.env.SIMPLY_NOTIFIER_MAX_BATCH ?? 500);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 1000) : 500;
}
export async function smsTargets(electionId: string, resendAll = false, voterIds?: string[]) {
  let q = getServiceDbSupabase().from("voter_registry").select("id,phone,voter_name,invited_at").eq("election_id", electionId).eq("has_voted", false).not("phone", "is", null);
  if (voterIds) q = q.in("id", voterIds.length ? voterIds : ["00000000-0000-0000-0000-000000000000"]);
  else if (!resendAll) q = q.is("invited_at", null);
  const voters: Voter[] = [];
  for (let offset=0; ; offset+=500) {
    const { data, error } = await q.order("id").range(offset,offset+499);
    if (error) throw new Error("유권자 명부를 불러오지 못했습니다.");
    voters.push(...(data??[]) as Voter[]);
    if ((data?.length??0)<500) break;
  }
  return voters;
}
/** 전체 비용을 먼저 예약한다. 확정 실패만 환불하며 응답 불명은 보류한다. */
export async function sendVoteInviteSms({ electionId, baseUrl, dryRun = false, resendAll = false, voterIds, actorId, format = "standard", smsTitle, kind = "bulk" }: Options): Promise<SmsInviteResult> {
  const fail = (error: string, message: string, status = 409): SmsInviteResult => ({ ok: false, error, message, status });
  const config = getNotifierConfig(), pepper = getVoterCodePepper();
  if (!config || !pepper || !baseUrl) return fail("not_configured", "문자 발송 설정을 확인해주세요.", 503);
  const db = getServiceDbSupabase();
  const { data: e, error } = await db.from("elections").select("id,name,status,sms_title,ends_at,trashed_at").eq("id", electionId).maybeSingle();
  if (error || !e) return fail("not_found", "선거 정보를 찾을 수 없습니다.", 404);
  if (e.trashed_at || e.status !== "active" || (e.ends_at && Date.parse(e.ends_at) <= Date.now())) return fail("not_active", "진행 중인 투표만 문자를 보낼 수 있습니다.");
  const check = format === "compact" ? checkCompactTitle(smsTitle ?? e.sms_title ?? e.name) : checkSmsTitle(smsTitle ?? e.sms_title);
  if (!check.ok) return fail("invalid_sms_title", check.message, 400);
  const title = check.value || defaultSmsTitle(e.name);
  const targets = (await smsTargets(electionId, resendAll, voterIds)).map(voter => ({ voter, token: createVoterToken(), code: createVoterCode() }));
  const summary: SmsInviteSummary = { requested: 0, sent: 0, failed: 0, skipped: 0, dryRun, batchId: null, results: [], stopped: null, cost: 0, refunded: 0, uncertain: false };
  if (!targets.length) return { ok: true, summary };
  const price = getSmsPrices()[format], dispatch = new Map<string, string>(), unsettled = new Set<string>();
  const settle = async (items: { id: string; state: string }[]) => {
    if (dryRun || !items.length) return;
    const { data, error } = await db.rpc("sms_settle_many", { p_items: items });
    if (error) throw new Error("문자 정산을 확인하지 못했습니다. 자동 재발송하지 말고 운영자에게 문의해주세요.");
    summary.refunded += Number(data.refund ?? 0);
    for (const i of items) unsettled.delete(i.id);
  };
  if (!dryRun) {
    const { data, error } = await db.rpc("sms_reserve", { p_election_id: electionId, p_voter_ids: targets.map(t => t.voter.id), p_format: format, p_kind: kind, p_price: price, p_actor: /^[a-f0-9-]{36}$/i.test(actorId) ? actorId : null, p_only_uninvited: !voterIds && !resendAll });
    if (error) return fail("reserve_failed", "발송비 예약에 실패했습니다. 다시 조회해주세요.", 503);
    if (!data?.ok) return fail(data?.error ?? "reserve_failed", data?.error === "insufficient_credits" ? `포인트가 부족합니다. 필요 ${data.required}P, 잔액 ${data.balance}P입니다. 포인트를 충전해주세요.` : data?.error === "dispatch_pending" ? "발송 또는 정산 대기 중입니다. 운영자 확인 전에는 재발송하지 마세요." : "대상·기한·재발송 횟수를 다시 확인해주세요.", data?.error === "insufficient_credits" ? 402 : 409);
    for (const i of data.items) { dispatch.set(i.id, i.dispatch); unsettled.add(i.dispatch); summary.resendCount = i.resendCount; }
  }
  try {
    for (let offset = 0; offset < targets.length; offset += getNotifierChunkSize()) {
      const {data: status,error: statusError} = await db.from("elections").select("status,ends_at").eq("id",electionId).maybeSingle();
      if (statusError || status?.status!=="active" || (status.ends_at && Date.parse(status.ends_at)<=Date.now())) {summary.stopped="투표가 중단·마감되었거나 상태를 확인할 수 없어 남은 발송을 취소했습니다.";break;}
      const chunk = targets.slice(offset, offset + getNotifierChunkSize());
      const hashes = new Map(chunk.map(t => [t.voter.id, hashVoterToken(t.token)]));
      let previous: { id: string; previous_hash: string | null; previous_code_hash: string | null }[] = [];
      const restore = async (ids: string[]) => {
        if (dryRun || !ids.length) return;
        const { error } = await db.rpc("restore_voter_tokens", { p_election_id: electionId, p_tokens: previous.filter(p => ids.includes(p.id)).map(p => ({ ...p, hash: hashes.get(p.id) })) });
        if (error) throw new Error("기존 코드 복구를 확인하지 못했습니다. 운영자에게 문의해주세요.");
      };
      if (!dryRun) {
        let rotated = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await db.rpc("rotate_voter_tokens", { p_election_id: electionId, p_tokens: chunk.map(t => ({ id: t.voter.id, hash: hashes.get(t.voter.id), code_hash: hashVoterCode(t.code, pepper) })) });
          if (!r.error) { previous = r.data ?? []; rotated = true; break; }
          if (r.error.code !== "23505") break;
          for (const t of chunk) t.code = createVoterCode();
        }
        if (!rotated) { summary.stopped = "투표 코드 준비에 실패했습니다."; break; }
      }
      let eligible = dryRun ? chunk : chunk.filter(t => previous.some(p => p.id === t.voter.id));
      await settle(chunk.filter(t => !eligible.includes(t)).map(t => ({ id: dispatch.get(t.voter.id)!, state: "failed" })));
      if (!eligible.length) continue;
      if (!dryRun) {
        // A ballot may have been cast after the first targets query and token rotation.
        // Re-read the immutable cast flag just before the external SMS call.
        const { data: outstanding, error: recheckError } = await db.from("voter_registry")
          .select("id").in("id", eligible.map(t => t.voter.id)).eq("has_voted", false);
        if (recheckError) throw new Error("발송 직전 투표 상태를 확인하지 못했습니다.");
        const stillEligible = new Set((outstanding ?? []).map(row => row.id));
        const cancelled = eligible.filter(t => !stillEligible.has(t.voter.id));
        if (cancelled.length) {
          await settle(cancelled.map(t => ({ id: dispatch.get(t.voter.id)!, state: "failed" })));
          eligible = eligible.filter(t => stillEligible.has(t.voter.id));
        }
        if (!eligible.length) continue;
      }
      let batch;
      try {
        batch = await sendNotifierBatch({ ...config, template: format === "compact" ? COMPACT_TEMPLATE : config.template }, { dryRun, recipients: eligible.map(({ voter, token, code }): NotifierRecipient => ({ phone: voter.phone, ref: voter.id, variables: format === "compact" ? { title, code: formatVoterCode(code) } : { title, name: voter.voter_name?.trim() || "유권자", url: `${baseUrl}/v/${token}`, code: formatVoterCode(code) } })) });
      } catch (caught) {
        const definite = caught instanceof SimplyNotifierError && caught.status >= 400 && caught.status < 500;
        if (definite) await restore(eligible.map(t => t.voter.id));
        await settle(eligible.map(t => ({ id: dispatch.get(t.voter.id)!, state: definite ? "failed" : "unknown" })));
        summary.uncertain = !definite;
        summary.stopped = definite ? "발송 요청이 거절되어 예약 포인트를 반환했습니다." : "발송 결과가 불명확해 포인트와 코드를 보류했습니다. 운영자에게 문의해주세요.";
        break;
      }
      summary.requested += batch.requested; summary.sent += batch.sent; summary.failed += batch.failed; summary.skipped += batch.skipped;
      summary.results.push(...batch.results); summary.batchId ??= batch.batch_id; summary.cost += batch.sent * price;
      const failedIds = eligible.filter(t => ["failed", "error", "skipped"].includes(batch.results.find(r => r.ref === t.voter.id)?.status ?? "")).map(t => t.voter.id);
      await restore(failedIds);
      await settle(eligible.map(t => { const status = batch.results.find(r => r.ref === t.voter.id)?.status; const state = status === "sent" ? "sent" : failedIds.includes(t.voter.id) ? "failed" : "unknown"; if (state === "unknown" && !dryRun) summary.uncertain = true; return { id: dispatch.get(t.voter.id)!, state }; }));
      if (summary.uncertain) { summary.stopped = "일부 발송 결과가 불명확합니다. 운영자 확인 전에는 재발송하지 마세요."; break; }
    }
  } catch (caught) {
    summary.stopped = caught instanceof Error ? caught.message : "문자 처리를 완료하지 못했습니다.";
    summary.uncertain = true;
    return { ok: true, summary };
  }
  await settle([...unsettled].map(id => ({ id, state: "failed" })));
  if (!dryRun) await db.from("audit_logs").insert({ event_type: "sms_invites_sent", election_id: electionId, details: { actor: actorId, format, sent: summary.sent, cost: summary.cost, refunded: summary.refunded, stopped: summary.stopped } });
  return { ok: true, summary };
}
