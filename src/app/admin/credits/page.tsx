"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Coins, KeyRound, Plus, Search } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Badge, Button, Field, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import { formatDate } from "@/lib/utils";

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

type ApiClientRow = {
  id: string;
  name: string;
  owner_user_id: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
};

export default function CreditsPage() {
  return (
    <AdminGate>
      <Credits />
      <div className="mx-auto mt-5 grid max-w-2xl gap-5">
        <ApiClientsPanel />
      </div>
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

function ApiClientsPanel() {
  const [clients, setClients] = useState<ApiClientRow[]>([]);
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [issuedKey, setIssuedKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ clients: ApiClientRow[] }>(
        "/api/admin/api-clients",
        { headers: await authHeaders() },
      );
      setClients(data.clients);
    } catch {
      // 목록 로드는 부가 기능이므로 조용히 무시
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setIssuedKey("");
    try {
      const result = await fetchJson<{ apiKey: string }>("/api/admin/api-clients", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name, ownerEmail }),
      });
      setIssuedKey(result.apiKey);
      setName("");
      setOwnerEmail("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "API 키 발급에 실패했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(client: ApiClientRow) {
    try {
      await fetchJson(`/api/admin/api-clients/${client.id}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ isActive: !client.is_active }),
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "API 클라이언트 변경에 실패했습니다.",
      );
    }
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <KeyRound size={22} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">외부 앱 연동 (API 키)</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            다른 앱이 <code className="rounded bg-slate-100 px-1">POST /api/v1/elections</code>
            로 투표를 생성할 수 있는 키를 발급합니다. 연동 선거는 연동 조합
            지갑에서 유권자 수만큼 포인트가 차감됩니다.
          </p>
        </div>
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={create}>
        <Field
          label="클라이언트 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 조합 관리 시스템"
        />
        <Field
          label="소유자(과금) 이메일"
          type="email"
          value={ownerEmail}
          onChange={(event) => setOwnerEmail(event.target.value)}
          placeholder="owner@example.com"
        />
        <Button type="submit" disabled={submitting || !name || !ownerEmail}>
          <Plus size={17} aria-hidden="true" />
          키 발급
        </Button>
      </form>

      {issuedKey ? (
        <Alert tone="warning">
          발급된 API 키(지금 한 번만 표시됩니다):{" "}
          <code className="break-all font-mono text-xs">{issuedKey}</code>
        </Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      {clients.length > 0 ? (
        <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">마지막 사용</th>
                <th className="px-4 py-3 font-medium">발급일</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 text-slate-950">{client.name}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        client.is_active
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-slate-300 bg-slate-200 text-slate-700"
                      }
                    >
                      {client.is_active ? "활성" : "비활성"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {client.last_used_at ? formatDate(client.last_used_at) : "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(client.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => toggle(client)}>
                      {client.is_active ? "비활성화" : "활성화"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}
