"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Coins, Search } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";

type LedgerRow = {
  id: string;
  delta: number;
  balance_after: number;
  reason: string;
  memo: string | null;
  election_id: string | null;
  created_at: string;
};

type CreditsResponse = {
  unionId: string;
  balance: number;
  updatedAt: string | null;
  ledger: LedgerRow[];
};

export default function CreditsPage() {
  return (
    <AdminGate>
      <Credits />
    </AdminGate>
  );
}

function Credits() {
  const [unionId, setUnionId] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [info, setInfo] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function lookup() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const data = await fetchJson<CreditsResponse>(
        `/api/admin/credits?unionId=${encodeURIComponent(unionId.trim())}`,
        { headers: await authHeaders() },
      );
      setInfo(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "조회하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function charge() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const data = await fetchJson<{ success: true; balance: number }>("/api/admin/credits", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ unionId: unionId.trim(), amount: Number(amount), memo }),
      });
      setNotice(`처리 완료. 현재 잔액 ${data.balance.toLocaleString()}P`);
      setAmount("");
      setMemo("");
      await lookup();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "충전에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <Link href="/admin" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700">
        <ArrowLeft size={16} aria-hidden="true" />
        관리자 홈
      </Link>

      <Panel className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Coins size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">조합별 포인트 충전</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              연동 선거(중요 안건)는 유권자 수 × 포인트가 <strong>연동 조합 지갑</strong>에서 선불 차감됩니다. nozolink 조합 ID로 잔액을 지급하세요.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <Field
            label="연동 조합 ID (nozolink union uuid)"
            value={unionId}
            onChange={(event) => setUnionId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={lookup} disabled={loading || !unionId.trim()}>
              <Search size={18} aria-hidden="true" />
              잔액 조회
            </Button>
          </div>

          <Field
            label="충전 포인트 (음수면 차감)"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            placeholder="10000"
          />
          <Field
            label="메모 (선택)"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="지급 사유"
          />

          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {error ? <Alert>{error}</Alert> : null}

          <Button onClick={charge} disabled={loading || !unionId.trim() || !amount}>
            <Coins size={18} aria-hidden="true" />
            {loading ? "처리 중" : "포인트 지급"}
          </Button>
        </div>
      </Panel>

      {info ? (
        <Panel className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">현재 잔액</h2>
            <span className="text-2xl font-bold text-blue-700">{info.balance.toLocaleString()}P</span>
          </div>
          <div className="mt-4 grid gap-2">
            {info.ledger.length === 0 ? (
              <p className="text-sm text-slate-500">원장 기록이 없습니다.</p>
            ) : (
              info.ledger.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="text-slate-600">
                    {row.reason}
                    {row.memo ? ` · ${row.memo}` : ""}
                  </span>
                  <span className={row.delta >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                    {row.delta >= 0 ? "+" : ""}
                    {row.delta.toLocaleString()}P
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
