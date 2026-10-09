"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Home, LayoutDashboard, ShieldCheck } from "lucide-react";
import { RECEIPT_STORAGE_KEY, type SavedReceipt } from "@/components/ballot-sheet";
import { Alert, Button, Panel } from "@/components/ui";

export default function VoteCompletePage() {
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      // 예전 버전이 localStorage 에 남긴 영수증(선택 항목 포함)은 지운다
      localStorage.removeItem(RECEIPT_STORAGE_KEY);
      const raw = sessionStorage.getItem(RECEIPT_STORAGE_KEY);
      if (raw) {
        setReceipt(JSON.parse(raw) as SavedReceipt);
      }
    } catch {
      setReceipt(null);
    }
  }, []);

  async function copyReceipt() {
    if (!receipt) {
      return;
    }

    await navigator.clipboard.writeText(
      [
        `election_id=${receipt.electionId}`,
        `receipt_hash=${receipt.receiptHash}`,
        `salt=${receipt.salt}`,
      ].join("\n"),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Panel className="p-6 text-center sm:p-8">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={48} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold text-slate-950">
          투표가 완료되었습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          소중한 한 표를 행사해주셔서 감사합니다. 투표 결과는 선거 종료 후
          확인할 수 있습니다.
        </p>

        {receipt ? (
          <div className="mt-6 rounded-lg border border-[var(--border)] bg-slate-50 p-4 text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ShieldCheck size={18} aria-hidden="true" />
              공개 검증 영수증
            </div>
            <dl className="mt-3 grid gap-3 text-xs">
              <ReceiptRow label="선거" value={receipt.electionName || receipt.electionId} />
              <ReceiptRow label="영수증 해시" value={receipt.receiptHash} mono />
              <ReceiptRow label="검증 Salt" value={receipt.salt} mono />
            </dl>
            <Button className="mt-4 w-full" variant="secondary" onClick={copyReceipt}>
              <Copy size={17} aria-hidden="true" />
              {copied ? "복사됨" : "영수증 복사"}
            </Button>
          </div>
        ) : null}

        <div className="mt-5 text-left">
          <Alert tone="info">
            영수증은 이 창을 닫으면 사라지고 서버에도 누구 것인지 남지 않습니다. 확인하고
            싶다면 지금 복사해 두세요. 투표가 끝나면 공개 검증 화면에서 영수증 해시로 내 표가
            그대로 집계되었는지 확인할 수 있습니다.
          </Alert>
        </div>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Home size={18} aria-hidden="true" />
            홈으로
          </Link>
          <Link
            href="/verify"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            공개 검증
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            진행률 보기
          </Link>
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
