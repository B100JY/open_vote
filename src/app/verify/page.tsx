"use client";

import { useState } from "react";
import { CheckCircle2, FileCheck2, ShieldCheck, XCircle } from "lucide-react";
import { Alert, Button, Panel } from "@/components/ui";
import { ReceiptPassphraseInput } from "@/components/receipt-passphrase-input";
import { fetchJson } from "@/lib/client-fetch";
import { describeSelection } from "@/lib/ballot";
import { isProtectedReceipt, parseVerificationReceipt } from "@/lib/vote-receipt";
import { unlockReceipt } from "@/lib/protected-receipt";
import { verifyBundle, type AuditBundle, type AuditCheck } from "@/lib/native-audit";

type SimulatedSource = {
  election: { id: string; name: string };
};

/**
 * 실선거·모의선거에서 같은 검증 UI/암호 해제·서명 검증 코드 사용.
 * 로컬 JSON과 비밀번호를 서버로 보내지 않고 공개 원장만 내려받는다.
 */
export default function VerifyPage({ simulation, simulatedBundle }: {
  simulation?: SimulatedSource;
  simulatedBundle?: AuditBundle;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [checks, setChecks] = useState<AuditCheck[] | null>(null);
  const [selection, setSelection] = useState("");
  const [electionName, setElectionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function resetResults() {
    setChecks(null);
    setSelection("");
    setElectionName("");
    setError("");
  }

  async function handleVerify() {
    resetResults();
    if (!file) { setError("저장한 영수증 JSON 파일을 선택해 주세요."); return; }
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw new Error("영수증 파일은 1MB 이하만 사용할 수 있습니다.");
      const parsed = parseVerificationReceipt(await file.text());
      if (!parsed || !isProtectedReceipt(parsed)) throw new Error("암호화 영수증 JSON 파일을 선택해 주세요.");
      if (simulation && parsed.electionId !== simulation.election.id) {
        throw new Error("이 모의 선거의 영수증이 아닙니다. 이 테스트실에서 내려받은 파일을 선택해 주세요.");
      }
      if (!password) throw new Error("영수증을 저장할 때 정한 암호를 입력해 주세요.");
      if (!parsed.audit.witness) throw new Error("접수 서명이 없는 영수증입니다. 투표 완료 화면에서 다시 저장해 주세요.");

      const unlocked = await unlockReceipt(parsed, password);
      // A signed, public receipt witness grants access to closed-election verification data.
      // The password, choice, receiptHash and salt stay in the browser.
      const bundle = simulatedBundle ?? await fetchJson<AuditBundle>(
        `/api/elections/${encodeURIComponent(parsed.electionId)}/receipt-bundle`,
        {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({ witness: parsed.audit.witness }),
        },
      );

      if (bundle.manifest?.payload?.election.id !== parsed.electionId) {
        throw new Error("영수증과 공개 기록의 선거가 다릅니다.");
      }
      const results = await verifyBundle(bundle, unlocked);
      const ownCheck = results.find(item => item.check === "OWN_BALLOT");
      if (ownCheck?.status === "PASS" && "receiptHash" in unlocked) {
        const ballot = bundle.ledger.ballots.find(item => item.receipt_hash === unlocked.receiptHash);
        if (ballot) setSelection(describeSelection(ballot.selection, bundle.manifest.payload.election.candidates));
      }
      setElectionName(bundle.manifest.payload.election.name);
      setChecks(results);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일과 암호를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const own = checks?.find(item => item.check === "OWN_BALLOT");
  const witnessed = checks?.find(item => item.check === "OWN_WITNESS");
  const record = checks?.find(item => item.check === "HISTORY_AND_LEDGER");
  const recount = checks?.find(item => item.check === "TALLY_RECOUNT");
  const signature = checks?.find(item => item.check === "FINAL_SIGNATURE");
  const failed = checks?.filter(item => item.status === "FAIL") ?? [];
  const allChecked = Boolean(checks && own?.status === "PASS"
    && record?.status === "PASS" && recount?.status === "PASS"
    && signature?.status === "PASS" && witnessed?.status === "PASS" && !failed.length);

  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">투표 검증</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          저장한 영수증과 암호로 내 표가 공개 기록에 그대로 남아 있는지 확인합니다.
        </p>
        {simulation ? <p className="mt-2 text-xs text-blue-700">모의 선거: 실제 투표와 같은 검증 기능을 임시 데이터로 시험합니다.</p> : null}
      </div>

      <Panel className="grid gap-4 p-5">
        <div className="grid gap-2 text-sm font-medium text-slate-800">
          <span>영수증 JSON 파일</span>
          <label className="group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2">
            <input
              type="file"
              accept=".json,application/json"
              aria-label="영수증 JSON 파일 선택"
              onChange={event => {
                setFile(event.target.files?.[0] ?? null);
                resetResults();
              }}
              className="sr-only"
            />
            <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-slate-400 bg-white px-4 font-semibold text-slate-800 shadow-sm group-hover:bg-slate-100">
              파일 선택
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-sm font-normal ${file ? "text-slate-800" : "text-slate-500"}`}
              title={file?.name ?? "선택된 파일 없음"}
              aria-live="polite"
            >
              {file?.name ?? "선택된 파일 없음"}
            </span>
          </label>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-800">
          영수증 보호 암호
          <ReceiptPassphraseInput value={password} onChange={value => {
            setPassword(value);
            resetResults();
          }} placeholder="영수증 저장 시 설정한 암호" />
        </label>
        <Button disabled={busy} onClick={() => void handleVerify()}>
          <FileCheck2 size={18} aria-hidden="true" />{busy ? "검증 중…" : "검증하기"}
        </Button>
        <p className="text-xs leading-5 text-slate-500">영수증과 암호는 이 기기에서만 확인하며 서버로 보내지 않습니다.</p>
      </Panel>

      {error ? <Alert>{error}</Alert> : null}
      {checks ? (
        <Panel className="grid gap-4 p-5" aria-live="polite">
          <div className="flex items-center gap-2">
            {allChecked ? <CheckCircle2 className="text-emerald-700" size={24} aria-hidden="true" />
              : failed.length ? <XCircle className="text-red-700" size={24} aria-hidden="true" />
              : <ShieldCheck className="text-amber-600" size={24} aria-hidden="true" />}
            <h2 className="text-lg font-semibold">
              {allChecked ? "내 표와 공개 기록이 일치합니다" : failed.length ? "검증에서 불일치를 발견했습니다" : "일부 항목은 확인되지 않았습니다"}
            </h2>
          </div>
          <p className="text-sm text-slate-600">{electionName}</p>
          <div className="grid gap-3 text-sm">
            <ResultRow label="내 표" status={own?.status} detail={own?.status === "PASS" ? "내 표가 원장에 있고 선택이 일치합니다." : "내 선택을 확인할 수 없습니다."} />
            {selection && own?.status === "PASS" ? <p className="rounded-lg bg-slate-50 p-3 text-slate-800">기록된 선택: <strong>{selection}</strong></p> : null}
            <ResultRow label="접수 기록" status={witnessed?.status} detail="투표 당시의 서명과 공개 기록 비교" />
            <ResultRow label="전체 기록·집계" status={
              record?.status === "FAIL" || recount?.status === "FAIL" || signature?.status === "FAIL" ? "FAIL"
                : record?.status === "PASS" && recount?.status === "PASS" && signature?.status === "PASS" ? "PASS" : "UNCONFIRMED"
            } detail="원장 변경 여부와 집계 수치 확인" />
          </div>
          {failed.length ? <Alert>일치하지 않는 검사: {failed.map(item => item.check).join(", ")}</Alert> : null}
          <p className="text-xs leading-5 text-slate-500">이 검사는 공개 자료의 일치를 확인하지만, 서버 해킹 등으로 인한 모든 부정을 완전히 증명하거나 완벽히 배제하지는 않습니다.</p>
        </Panel>
      ) : null}
    </div>
  );
}

function ResultRow({ label, status, detail }: {
  label: string;
  status: AuditCheck["status"] | undefined;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      {status === "PASS" ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
        : status === "FAIL" ? <XCircle size={20} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
        : <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />}
      <div className="grid gap-1">
        <p className="font-semibold">{label}: {status === "PASS" ? "정상" : status === "FAIL" ? "불일치" : "미확인"}</p>
        <p className="text-xs leading-5 text-slate-600">{detail}</p>
      </div>
    </div>
  );
}
