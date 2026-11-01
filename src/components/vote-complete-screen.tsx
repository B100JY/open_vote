"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, Home, Info, LayoutDashboard, ShieldCheck } from "lucide-react";
import { RECEIPT_STORAGE_KEY, parseSavedReceipt, type SavedReceipt } from "@/lib/vote-receipt";
import { protectReceipt } from "@/lib/protected-receipt";
import { ReceiptPassphraseInput } from "@/components/receipt-passphrase-input";
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
  const [receiptPassword, setReceiptPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function prepareLockedReceipt() {
    if (!receipt?.audit) throw new Error("이 선거는 영수증 암호화를 지원하지 않습니다.");
    if (!receipt.audit.witness) throw new Error("접수 서명이 아직 준비되지 않아 저장할 수 없습니다.");
    if (receiptPassword.length < 4) throw new Error("영수증 암호는 4자 이상 입력해 주세요.");
    if (receiptPassword !== confirmPassword) throw new Error("영수증 암호가 서로 다릅니다.");
    return protectReceipt(receipt, receiptPassword);
  }

  async function saveReceipt() {
    setSaving(true);
    setCopyError("");
    try {
      const locked = await prepareLockedReceipt();
      downloadReceipt(locked);
      setReceiptPassword("");
      setConfirmPassword("");
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "영수증 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function copyReceipt() {
    setSaving(true);
    setCopyError("");
    try {
      const locked = await prepareLockedReceipt();
      await navigator.clipboard.writeText(JSON.stringify(locked));
      setCopied(true);
      setReceiptPassword("");
      setConfirmPassword("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "암호화 영수증 복사에 실패했습니다.");
    } finally {
      setSaving(false);
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
                <span><strong>영수증과 암호는 다른 사람에게 알려주지 마세요.</strong></span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                투표 당시의 확인값을 암호로 저장합니다. 선거가 끝나면 공개된 기록과 비교해 <strong>내 표가 제대로 반영되었는지</strong> 확인할 수 있습니다.
              </p>
              {receipt.audit ? (
                <>
                  <label className="mt-4 block text-sm font-medium text-slate-700">영수증 보호 암호 (4자 이상)
                    <ReceiptPassphraseInput value={receiptPassword} onChange={setReceiptPassword} placeholder="영수증을 열 때 사용할 암호" />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-slate-700">암호 확인
                    <ReceiptPassphraseInput value={confirmPassword} onChange={setConfirmPassword} placeholder="암호를 다시 입력하세요" />
                  </label>
                  <Button variant="secondary" className="mt-4 w-full" disabled={preview || saving || !receipt.audit.witness} onClick={saveReceipt}>
                    <Download size={17} aria-hidden="true" /> {saving ? "영수증 암호화 중" : "암호화 영수증 저장"}
                  </Button>
                  <p className="mt-2 text-xs leading-5 text-slate-500">암호는 서버에 저장되지 않습니다. 잊어버리면 내 표를 검증할 수 없습니다. 4자리 숫자처럼 쉬운 암호보다는 긴 암호를 권장합니다. 저장하지 않아도 투표는 완료됩니다.</p>
                </>
              ) : <div className="mt-4"><Alert tone="info">이 선거에서는 개인 영수증 검증을 지원하지 않습니다.</Alert></div>}
              {receipt.audit && !receipt.audit.witness ? <p className="mt-2 text-xs leading-5 text-slate-500">접수 서명이 아직 준비되지 않았습니다. 개인 투표 링크에서 접수 확인증 이어받기를 완료한 뒤 저장해 주세요.</p> : null}
              <details className="mt-4 border-t border-slate-200 pt-4">
                <summary className="cursor-pointer text-sm font-medium text-blue-700"><Info size={16} className="mr-1 inline" aria-hidden="true" />영수증은 어디에 쓰나요?</summary>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <p>지금 영수증을 암호화된 파일로 저장합니다. 선거 종료 후 ‘공개 검증’에서 파일과 암호를 입력하면 내 표가 기록에 있고 선택이 바뀌지 않았는지 확인할 수 있습니다.</p>
                </div>
              </details>
              <details className="mt-4 border-t border-slate-200 pt-4">
                <summary className="cursor-pointer text-sm text-slate-600">자세한 검증 정보</summary>
                <dl className="mt-3 grid gap-3 text-xs">
                  <ReceiptRow label="선거" value={receipt.electionName || receipt.electionId} />
                  {receipt.audit?.commitment ? <ReceiptRow label="접수 약정" value={receipt.audit.commitment} mono /> : null}
                  {receipt.contextHash ? <ReceiptRow label="투표 항목 기준값" value={receipt.contextHash} mono /> : null}
                </dl>
                {receipt.audit?.witness ? <Button className="mt-4 w-full" variant="secondary" disabled={preview || saving || !receipt.audit.witness} onClick={copyReceipt}>
                  <Copy size={17} aria-hidden="true" />{copied ? "복사됨" : "암호화 영수증 복사"}
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
