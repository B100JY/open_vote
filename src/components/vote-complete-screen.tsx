"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, Home, Info, LayoutDashboard, ShieldCheck } from "lucide-react";
import { RECEIPT_STORAGE_KEY, formatReceiptForCopy, parseSavedReceipt, type SavedReceipt } from "@/lib/vote-receipt";
import { downloadReceipt } from "@/lib/receipt-file";
import { Alert, Button, Panel } from "@/components/ui";

// 합성 자료는 화면 확인 전용이며 실제 영수증 저장소를 읽거나 덮어쓰지 않는다.
const PREVIEW_RECEIPT: SavedReceipt = {
  electionId: "00000000-0000-4000-8000-000000000000",
  electionName: "관리자 미리보기 · 예시 투표",
  receiptHash: "0123456789abcdef".repeat(4),
  salt: "0".repeat(64),
  contextHash: "1".repeat(64),
};

export function VoteCompleteScreen({ preview = false, simulatedReceipt, onSimulatedVerify, onSimulatedBallot }: { preview?: boolean; simulatedReceipt?: SavedReceipt; onSimulatedVerify?: () => void; onSimulatedBallot?: () => void }) {
  const [receipt, setReceipt] = useState<SavedReceipt | null>(simulatedReceipt ?? (preview ? PREVIEW_RECEIPT : null));
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(preview || !!simulatedReceipt);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    if (preview || simulatedReceipt) return;
    try {
      // 예전 버전이 localStorage 에 남긴 영수증(선택 항목 포함)은 지운다
      localStorage.removeItem(RECEIPT_STORAGE_KEY);
    } catch { /* 레거시 저장소 접근이 막혀도 현재 영수증은 읽는다. */ }
    try {
      setReceipt(parseSavedReceipt(sessionStorage.getItem(RECEIPT_STORAGE_KEY)));
    } catch {
      setReceipt(null);
    } finally {
      setReady(true);
    }
  }, [preview, simulatedReceipt]);

  async function copyReceipt() {
    if (!receipt) {
      return;
    }

    setCopyError("");
    try {
      await navigator.clipboard.writeText(formatReceiptForCopy(receipt));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("안전한 확인증을 복사하지 못했습니다. 접수 서명이 준비됐는지 확인해주세요.");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {simulatedReceipt ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-semibold">관리자 모의 선거 · 실제 완료 화면</p><p>이 영수증은 브라우저 안의 모의 원장에만 대응하며 운영 투표가 접수된 것이 아닙니다.</p></div> : null}
      {preview ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p className="font-semibold">관리자 전용 · 투표 완료 화면 미리보기</p><p>아래는 예시입니다. 실제 투표는 접수되지 않으며, 영수증 저장·복사는 비활성화됩니다.</p><Link href="/admin/manage" className="mt-2 inline-block underline">관리자 메뉴로</Link></div> : null}
      <Panel className="p-6 text-center sm:p-8">
        <span className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${receipt ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
          {receipt ? <CheckCircle2 size={48} aria-hidden="true" /> : <Info size={48} aria-hidden="true" />}
        </span>
        <h1 className="mt-6 text-2xl font-semibold text-slate-950">
          {!ready ? "투표 영수증 확인 중" : receipt ? "투표가 완료되었습니다" : "투표 완료 여부를 확인할 수 없습니다"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {!ready
            ? "이 창에 저장된 영수증을 확인하고 있습니다."
            : receipt
              ? "소중한 한 표를 행사해주셔서 감사합니다. 투표 결과는 선거 종료 후 확인할 수 있습니다."
              : "이 창에 저장된 영수증이 없습니다. 문자로 받은 개인 투표 링크를 다시 열어 참여 여부를 확인해주세요. 영수증을 저장하지 못한 경우에도 투표는 접수되었을 수 있습니다."}
        </p>

        {receipt ? (
          <details className="mt-6 rounded-xl border border-[var(--border)] bg-slate-50 text-left">
            <summary className="cursor-pointer select-none px-4 py-4 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <span className="inline-flex items-center gap-2"><ShieldCheck size={18} aria-hidden="true" />검증용 영수증 보기 (선택)</span>
              <span className="mt-1 block pl-7 text-xs font-normal leading-5 text-slate-500">검증이 필요한 경우에만 펼쳐서 확인하세요. 저장하지 않아도 투표는 완료됩니다.</span>
            </summary>
            <div className="border-t border-slate-200 px-4 pb-5 pt-4">
              <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <AlertTriangle size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span><strong>주의: 확인증은 다른 사람에게 보내지 마세요.</strong> 새 확인증에는 선택 결과를 알아낼 수 있는 값이 포함되지 않지만, 개인 접수 증빙은 본인만 보관하는 것이 안전합니다. 과거 방식의 영수증은 선택을 추적할 수 있습니다.</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                검증용 영수증은 선택 사항입니다. 나중에 서명된 접수 기록이 공개 원장에 포함되었는지 확인하려는 경우에만 저장하세요.
              </p>
              {receipt.audit ? (
                <Button variant="secondary" className="mt-4 w-full" disabled={preview} onClick={() => {
                  try { downloadReceipt(receipt); setCopyError(""); }
                  catch { setCopyError("확인증을 안전하게 저장하지 못했습니다."); }
                }}>
                  <Download size={17} aria-hidden="true" /> {receipt.audit.witness ? "선택 정보를 제외한 접수 확인증 저장" : "서명 대기 확인증 저장"}
                </Button>
              ) : <div className="mt-4"><Alert tone="info">이 투표는 이전 검증 방식입니다. 기존 영수증은 공개 원장에서 선택을 알아낼 수 있어 개인정보 보호를 위해 내려받기를 제한합니다.</Alert></div>}
              {receipt.audit && !receipt.audit.witness ? <p className="mt-2 text-xs leading-5 text-slate-500">접수 서명은 아직 준비 중입니다. 서명 대기 확인증을 보관한 후 공개 검증에서 이어받을 수 있습니다.</p> : null}
              {receipt.audit ? <p className="mt-3 text-xs leading-5 text-slate-600">나중에 검증하려면 이 화면을 닫기 전에 확인증을 저장하세요. 재발급은 제공되지 않으며, 저장하지 않아도 투표 접수와 결과에는 영향이 없습니다.</p> : null}
              <details className="mt-4 border-t border-slate-200 pt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-700"><Info size={16} className="mr-1 inline" aria-hidden="true" />영수증은 어디에 쓰나요?</summary>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <p>선거 종료 후 ‘공개 검증’에서 확인증과 공개 기록을 비교하면 서명된 접수 기록이 남아 있는지 확인할 수 있습니다.</p>
                  <p>선택을 추적할 수 있는 해시·Salt·비밀값은 새 확인증 파일에서 제외합니다. 따라서 파일만 유출되어도 공개 원장에서 어떤 항목을 선택했는지 연결할 수 없도록 했습니다.</p>
                  <p><strong>검증 범위:</strong> 접수 서명과 포함 여부를 확인하며, 이 파일만으로 내가 선택한 내용이 그대로 집계되었는지까지 증명하지는 못합니다.</p>
                </div>
              </details>
              <details className="mt-4 border-t border-slate-200 pt-4">
                <summary className="cursor-pointer text-sm text-slate-600">자세한 검증 정보</summary>
                <dl className="mt-3 grid gap-3 text-xs">
                  <ReceiptRow label="선거" value={receipt.electionName || receipt.electionId} />
                  {receipt.audit?.commitment ? <ReceiptRow label="접수 약정" value={receipt.audit.commitment} mono /> : null}
                  {receipt.contextHash ? <ReceiptRow label="투표 항목 기준값" value={receipt.contextHash} mono /> : null}
                </dl>
                {receipt.audit?.witness ? <Button className="mt-4 w-full" variant="secondary" disabled={preview} onClick={copyReceipt}>
                  <Copy size={17} aria-hidden="true" />{copied ? "복사됨" : "접수 확인증 복사"}
                </Button> : null}
              </details>
              {copyError ? <p role="alert" className="mt-3 text-sm text-red-700">{copyError}</p> : null}
            </div>
          </details>
        ) : null}

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <Link
            href={simulatedReceipt ? "/admin/manage" : "/"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Home size={18} aria-hidden="true" />
            {simulatedReceipt ? "관리자 메뉴" : "홈으로"}
          </Link>
          {onSimulatedVerify ? <button type="button" onClick={onSimulatedVerify} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"><ShieldCheck size={18} aria-hidden="true" />모의 공개 검증</button> : <Link
            href={receipt && !preview ? `/verify?election=${encodeURIComponent(receipt.electionId)}` : "/verify"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            공개 검증
          </Link>}
          {onSimulatedBallot ? <button type="button" onClick={onSimulatedBallot} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"><LayoutDashboard size={18} aria-hidden="true" />다른 코드로 투표</button> : <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            진행률 보기
          </Link>}
        </div>
      </Panel>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd
        className={
          mono
            ? "break-all font-mono text-[11px] leading-5 text-slate-950"
            : "text-slate-950"
        }
      >
        {value}
      </dd>
    </div>
  );
}
