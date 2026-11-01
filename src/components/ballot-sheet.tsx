"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Vote } from "lucide-react";
import { BallotForm } from "@/components/ballot-form";
import { Alert, Button } from "@/components/ui";
import {
  describeBallotRules,
  describeSelection,
  normalizeSelection,
  type BallotSelection,
} from "@/lib/ballot";
import type { BallotRules, Candidate } from "@/lib/types";
import { createVoteReceipt } from "@/lib/verification";
import { RECEIPT_STORAGE_KEY, type SavedReceipt } from "@/lib/vote-receipt";
import { electionContextHash } from "@/lib/receipt-audit";
import { commitment, hashObject, newSecret, verifySignature, eventHead, type Manifest, type Signed, type AuditEvent } from "@/lib/native-audit";
import { fetchJson } from "@/lib/client-fetch";
import { parseSavedReceipt } from "@/lib/vote-receipt";

export type BallotSheetElection = BallotRules & {
  organization_name?: string;
  audit_version?: number;
  id: string;
  name: string;
  description: string | null;
  candidates: Candidate[];
};

/**
 * 투표지 + 제출. 제출 방식(링크 토큰 / 로그인 세션)만 호출하는 쪽이 정한다.
 * 선택 내용은 기기에 남기지 않는다(공용 기기에서 다음 사람이 보지 못하게).
 */
export function BallotSheet({
  election,
  credential,
  notice,
  submit,
  simulatedSubmit,
}: {
  election: BallotSheetElection;
  credential?: { body: Record<string, string>; headers?: Record<string, string> };
  notice: string;
  submit: (selection: BallotSelection, receiptHash: string) => Promise<{ receiptHash: string }>;
  /** 관리자 브라우저 모의선거용. 운영 저장소·서버·영수증 세션을 쓰지 않는다. */
  simulatedSubmit?: (selection: BallotSelection, receipt: SavedReceipt) => Promise<void>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<BallotSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [manifest, setManifest] = useState<Signed<Manifest> | null>(null);
  const [challenge, setChallenge] = useState("");
  const [otp, setOtp] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const pending = useRef<SavedReceipt | null>(null);
  const approval = useRef<string | undefined>(undefined);
  const [hasPending, setHasPending] = useState(false);
  const audited = election.audit_version === 1 && !simulatedSubmit;
  useEffect(() => {
    if (!audited) return;
    let alive = true;
    fetchJson<{ manifest: Signed<Manifest> }>(`/api/elections/${election.id}/audit`)
      .then(async data => {
        if (!await verifySignature(data.manifest, data.manifest.payload) || data.manifest.payload.election.id !== election.id) throw new Error("시작 규칙의 서명을 확인하지 못했습니다.");
        if (alive) setManifest(data.manifest);
      }).catch(() => { if (alive) setError("감사 규칙을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요."); });
    return () => { alive = false; };
  }, [audited, election.id]);

  async function requestOtp() {
    if (!credential) return;
    setOtpBusy(true); setError("");
    try {
      const result = await fetchJson<{ challenge: string }>("/api/vote/otp", { method: "POST", headers: credential.headers, body: JSON.stringify({ ...credential.body, action: "request" }) });
      setChallenge(result.challenge); setOtp(""); approval.current = undefined;
    } catch (e) { setError(e instanceof Error ? e.message : "발송 실패"); }
    finally { setOtpBusy(false); }
  }

  const normalized = useMemo(
    () => (selection ? normalizeSelection(election.candidates, election, selection) : null),
    [election, selection],
  );

  async function handleSubmit() {
    if (!selection || !normalized?.ok) {
      return;
    }
    const confirmed = window.confirm(
      `${describeSelection(normalized.canonical, election.candidates)}\n\n이대로 제출하시겠습니까? 제출한 투표는 취소할 수 없습니다.`,
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (simulatedSubmit) {
        const result = await createVoteReceipt({ electionId: election.id, selection: normalized.canonical });
        const simulated: SavedReceipt = { electionId: election.id, electionName: election.name, ...result, contextHash: await electionContextHash(election) };
        await simulatedSubmit(selection, simulated);
        return;
      }
      if (audited) {
        if (!manifest || !credential) throw new Error("감사 규칙과 투표 자격을 확인해주세요.");
        const manifestHash = await hashObject(manifest.payload);
        const pendingKey = `moai_pending_${election.id}`;
        const old = pending.current ?? parseSavedReceipt(sessionStorage.getItem(pendingKey));
        let saved = old;
        if (saved) {
          const { createReceiptHash } = await import("@/lib/verification");
          if (!saved.audit || saved.electionId !== election.id || await createReceiptHash({ electionId: election.id, selection: normalized.canonical, salt: saved.salt }) !== saved.receiptHash || await hashObject(saved.audit.manifest.payload) !== manifestHash) throw new Error("이전 제출의 상태를 확인 중입니다. 이전 선택을 유지하거나 저장한 확인증으로 접수 여부를 확인해주세요.");
        } else {
          const receipt = await createVoteReceipt({ electionId: election.id, selection: normalized.canonical });
          const secret = newSecret();
          saved = { electionId: election.id, electionName: election.name, ...receipt, contextHash: await electionContextHash(election), audit: { secret, commitment: await commitment(election.id, manifestHash, receipt.receiptHash, secret), manifest } };
        }
        pending.current = saved; setHasPending(true);
        // 전송 전에 저장해 응답 유실 시 같은 비밀값·약정으로 확인한다. 저장 불가면 전송하지 않는다.
        sessionStorage.setItem(pendingKey, JSON.stringify(saved));
        const a = saved.audit!;
        const found = await fetchJson<{ witness: Signed<AuditEvent> | null }>(`/api/elections/${election.id}/audit?commitment=${a.commitment}`);
        let witness = found.witness;
        if (!witness) {
          let grant = approval.current;
          if (manifest.payload.smsRequired) {
            approval.current ??= newSecret();
            const result = await fetchJson<{ grant: string }>("/api/vote/otp", { method: "POST", headers: credential.headers, body: JSON.stringify({ ...credential.body, action: "verify", challenge, otp, grant: approval.current }) });
            grant = result.grant; approval.current = grant;
          }
          const result = await fetchJson<{ success: boolean; existingPublicEvent?: boolean; audit: { witness: Signed<AuditEvent> | null } | null }>("/api/vote/audit", { method: "POST", headers: credential.headers, body: JSON.stringify({ ...credential.body, selection, receiptHash: saved.receiptHash, commitment: a.commitment, manifestHash, grant }) });
          witness = result.audit?.witness ?? null;
          if (!result.success && !witness) throw new Error("새 접수 성공이 아닙니다. 저장한 확인증으로 다시 조회해주세요.");
        }
        if (witness && (!await verifySignature(witness, manifest.payload) || witness.payload.electionId !== election.id || witness.payload.manifestHash !== manifestHash || witness.payload.kind !== "vote" || witness.payload.payload.commitment !== a.commitment || witness.payload.head !== await eventHead(witness.payload))) throw new Error("접수 서명 검증에 실패했습니다. 보관한 확인증으로 확인해주세요.");
        if (witness) a.witness = witness;
        sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(saved));
        if (witness) sessionStorage.removeItem(pendingKey);
        router.replace("/vote/complete");
        return;
      }
      const receipt = await createVoteReceipt({ electionId: election.id, selection: normalized.canonical });
      const contextHash = await electionContextHash(election);
      const response = await submit(selection, receipt.receiptHash);
      if (response.receiptHash !== receipt.receiptHash) throw new Error("접수된 영수증이 제출한 값과 다릅니다. 재투표하지 말고 개인 링크에서 참여 여부를 확인해주세요.");
      const saved: SavedReceipt = {
        electionId: election.id,
        electionName: election.name,
        salt: receipt.salt,
        receiptHash: receipt.receiptHash,
        contextHash,
      };
      try {
        sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(saved));
      } catch {
        // 저장이 막힌 브라우저에서도 투표 자체는 끝났다
      }
      router.replace("/vote/complete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "투표 제출에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const hint =
    selection && normalized && !normalized.ok && normalized.error !== "empty_selection"
      ? normalized.message
      : "";

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        {election.organization_name ? <p className="mb-2 text-sm font-medium text-blue-700">{election.organization_name}</p> : null}
        <h1 className="text-2xl font-semibold text-slate-950">{election.name}</h1>
        {election.description ? (
          <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{election.description}</p>
        ) : null}
      </div>

      <Alert tone="info">
        <span className="inline-flex items-start gap-2">
          <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {notice} {describeBallotRules(election, election.candidates.length)}
          </span>
        </span>
      </Alert>

      {/* {audited ? <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600"><span>검증용 자료 · 저장은 선택입니다</span><Link href="/trust/verification" target="_blank" rel="noopener noreferrer" aria-label="검증용 자료 설명 보기 (새 탭)" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50"><Info size={18} aria-hidden="true" /></Link></div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-blue-700"><a className="underline" href={`/api/elections/${election.id}/audit?manifest=1`} download>시작 규칙 저장</a><a className="underline" href={`/api/elections/${election.id}/audit?checkpoint=1`} download>현재 기준점 저장</a></div>
      </div> : null} */}
      {error ? <Alert>{error}</Alert> : null}

      <BallotForm
        candidates={election.candidates}
        rules={election}
        value={selection}
        onChange={setSelection}
        disabled={submitting}
      />
      {audited && manifest?.payload.smsRequired ? <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">제출 전에 등록된 연락처의 문자 인증이 필요합니다. 재발송은 60초 뒤 가능하며 추가 비용이 발생합니다.</p>
        <Button variant="secondary" onClick={requestOtp} disabled={otpBusy || submitting}>{otpBusy ? "발송 중" : challenge ? "인증번호 다시 받기" : "문자 인증번호 받기"}</Button>
        {challenge ? <label className="grid gap-2 text-sm">문자 인증번호<input className="rounded border border-slate-300 p-3" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} /></label> : null}
      </div> : null}
      {audited && error && hasPending ? <Alert tone="info">접수 처리 중 응답이 끊겼을 수 있습니다. 이 화면을 닫지 말고 같은 선택으로 다시 시도하거나, 개인 투표 링크의 ‘접수 확인증 이어받기’를 이용해 주세요.</Alert> : null}

      <div className="sticky bottom-4 grid gap-2 rounded-lg border border-[var(--border)] bg-white p-4 shadow-lg shadow-slate-300/30">
        {hint ? <p className="text-sm text-amber-700">{hint}</p> : null}
        <Button onClick={handleSubmit} disabled={!normalized?.ok || submitting || (audited && !manifest)} className="w-full">
          {submitting ? (
            "제출 중"
          ) : (
            <>
              <Vote size={18} aria-hidden="true" />
              투표하기
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
