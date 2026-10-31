"use client";

import { NativeAuditPanel } from "./native-audit-panel";
import type { AuditBundle } from "@/lib/native-audit";
import { useState, type ChangeEvent } from "react";
import { Download, FileCheck } from "lucide-react";
import { Alert, Button, Panel } from "@/components/ui";
import { auditReceiptEvidence, makeAuditRecord, parseReceiptFile, withCheckpoint, type AuditResult } from "@/lib/receipt-audit";
import { downloadReceipt, downloadTextFile } from "@/lib/receipt-file";
import { receiptLabel, type SavedReceipt } from "@/lib/vote-receipt";
import type { Election, PublicBallotLedger } from "@/lib/types";

/** 개인 영수증 파일은 브라우저에서 읽기만 하고 서버에 업로드하지 않는다. */
function LegacyReceiptAuditPanel({ election, ledger }: { election: Election; ledger: PublicBallotLedger }) {
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setReceipt(null); setResult(null); setError("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw new Error("영수증 파일은 1MB 이하여야 합니다.");
      const parsed = parseReceiptFile(await file.text());
      if (!parsed) throw new Error("모아이투표에서 저장한 영수증 파일인지 확인해주세요.");
      const checked = await auditReceiptEvidence(parsed, makeAuditRecord(election, ledger));
      setReceipt(parsed); setResult(checked);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "영수증을 읽지 못했습니다.");
    } finally { setBusy(false); }
  }

  return (
    <Panel className="grid gap-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><FileCheck size={21} aria-hidden="true" /> 저장한 영수증으로 확인</h2>
      <p className="text-sm leading-6 text-slate-600">영수증을 선택하면 내 표와 투표 항목을 대조합니다. 마감 기록까지 보관한 영수증은 전체 기록의 변경도 확인합니다. 파일은 서버로 보내지 않습니다.</p>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        영수증 파일 선택
        <input type="file" accept=".html,.json,text/html,application/json" onChange={readFile} disabled={busy} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
      </label>
      {busy ? <p role="status" className="text-sm">영수증을 확인하고 있습니다.</p> : null}
      {error ? <Alert>{error}</Alert> : null}
      {receipt && result ? <div className="grid gap-3">
        <p className="font-mono text-sm text-slate-500">영수증 {receiptLabel(receipt)}</p>
        <Alert tone={result.valid ? "success" : "danger"}>{result.message}</Alert>
        {!receipt.contextHash ? <p className="text-sm text-slate-500">이전 버전 영수증으로 내 표의 선택을 확인합니다. 투표 당시 항목의 기준값은 포함되어 있지 않습니다.</p> : null}
        {result.valid ? <Button variant="secondary" onClick={() => downloadReceipt(withCheckpoint(receipt, result))}>
          <Download size={17} aria-hidden="true" /> 마감 기록을 담은 영수증 저장
        </Button> : null}
      </div> : null}
      <div className="border-t border-slate-200 pt-4">
        <Button variant="secondary" onClick={() => downloadTextFile(`모아이투표-${election.id.slice(0, 8)}-투표기록.json`, JSON.stringify(makeAuditRecord(election, ledger)))}>
          <Download size={17} aria-hidden="true" /> 투표 기록 파일 받기
        </Button>
        <p className="mt-2 text-sm leading-6 text-slate-500">저장한 영수증 파일을 직접 열어 이 기록 파일을 선택하면, 인터넷 연결 없이도 같은 검사를 할 수 있습니다. 영수증은 본인만 보관하세요.</p>
      </div>
    </Panel>
  );
}

export function ReceiptAuditPanel(props: { election: Election; ledger: PublicBallotLedger; simulatedBundle?: AuditBundle; simulatedReceipt?: SavedReceipt }) {
  return props.election.audit_version === 1 ? <NativeAuditPanel electionId={props.election.id} simulatedBundle={props.simulatedBundle} simulatedReceipt={props.simulatedReceipt} /> : <LegacyReceiptAuditPanel {...props} />;
}
