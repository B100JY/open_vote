"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Home, Info, LayoutDashboard, ShieldCheck } from "lucide-react";
import { RECEIPT_STORAGE_KEY, formatReceiptForCopy, parseSavedReceipt, receiptLabel, type SavedReceipt } from "@/lib/vote-receipt";
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
      setCopyError("영수증을 복사하지 못했습니다. 화면의 영수증 해시를 직접 선택해 복사해주세요.");
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
          <div className="mt-6 rounded-lg border border-[var(--border)] bg-slate-50 p-4 text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ShieldCheck size={18} aria-hidden="true" />
              검증용 영수증 · 선택 사항
            </div>
            <p className="mt-3 font-mono text-2xl font-semibold tracking-wide text-blue-700">{receiptLabel(receipt)}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-700">영수증을 저장하지 않아도 투표는 정상적으로 완료되었습니다. 나중에 내 표를 검증하고 싶을 때만 내려받으세요.</p>
            <Button variant="secondary" className="mt-4 w-full" disabled={preview} onClick={() => downloadReceipt(receipt)}>
              <Download size={17} aria-hidden="true" /> 검증용 영수증 저장 (선택)
            </Button>
            <Link href="/trust/verification" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-blue-700 underline"><Info size={16} aria-hidden="true" />영수증은 어디에 쓰나요? (새 탭)</Link>
            <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-600">자세한 검증 정보</summary>
            <dl className="mt-3 grid gap-3 text-xs">
              <ReceiptRow label="선거" value={receipt.electionName || receipt.electionId} />
              <ReceiptRow label="영수증 해시" value={receipt.receiptHash} mono />
              <ReceiptRow label="검증 Salt" value={receipt.salt} mono />
              {receipt.contextHash ? <ReceiptRow label="투표 항목 기준값" value={receipt.contextHash} mono /> : null}
            </dl>
            <Button className="mt-4 w-full" variant="secondary" disabled={preview} onClick={copyReceipt}>
              <Copy size={17} aria-hidden="true" />
              {copied ? "복사됨" : "영수증 복사"}
            </Button>
            </details>
            {copyError ? <p role="alert" className="mt-3 text-sm text-red-700">{copyError}</p> : null}
          </div>
        ) : null}

        {receipt?.audit && !receipt.audit.witness ? <div className="mt-4"><Alert tone="info">투표는 접수됐지만 접수 서명은 준비 중입니다. 같은 탭의 개인 링크에서 ‘접수 확인증 이어받기’를 눌러 다시 저장할 수 있습니다.</Alert></div> : null}
        {receipt ? <div className="mt-5 text-left">
          <Alert tone="info">
            나중에 내 표를 검증하려면 이 창을 닫기 전에 영수증을 저장하세요. 재발급은 되지 않으며, 화면의 짧은 번호만으로는 복구할 수 없습니다. 저장하지 않아도 투표 접수와 결과에는 영향이 없습니다.
          </Alert>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            영수증을 다른 사람에게 공유하면 선거 종료 후 그 사람이 내 선택 내용을 확인할 수 있습니다. 영수증은 본인만 보관해주세요.
          </p>
        </div> : null}

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
