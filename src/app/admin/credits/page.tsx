"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Coins,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Badge, Button, Field, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import type { CreditsSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type ApiClientRow = {
  id: string;
  name: string;
  owner_user_id: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
};

const txTypeLabels: Record<string, string> = {
  charge: "충전",
  vote_creation: "투표 생성",
  refund: "환불",
  admin_adjust: "관리자 조정",
};

export default function CreditsPage() {
  return (
    <AdminGate>
      <CreditsView />
    </AdminGate>
  );
}

function CreditsView() {
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<CreditsSummary>("/api/credits", {
        headers: await authHeaders(),
      });
      setCredits(data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "포인트 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            투표 생성
          </Link>
          <h1 className="text-2xl font-semibold text-slate-950">포인트 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            투표 생성 시 유권자 1인당 {credits?.unitPrice ?? 10}P가 차감됩니다.
            포인트는 결제(입금) 확인 후 관리자가 지급합니다.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Coins size={22} aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm text-slate-500">보유 포인트</div>
              <div className="text-3xl font-semibold text-slate-950">
                {credits ? `${credits.balance.toLocaleString()}P` : "-"}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            1P = 1원 기준의 선불 포인트입니다. 잔액이 부족하면 투표를 생성할 수
            없습니다. 충전이 필요하면 운영자에게 문의해주세요.
          </p>
        </Panel>

        {credits?.isAdmin ? <GrantForm onGranted={load} /> : null}
      </div>

      <Panel className="p-5">
        <h2 className="text-lg font-semibold">거래 내역</h2>
        {credits && credits.transactions.length > 0 ? (
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">일시</th>
                  <th className="px-4 py-3 font-medium">유형</th>
                  <th className="px-4 py-3 font-medium">내용</th>
                  <th className="px-4 py-3 text-right font-medium">증감</th>
                  <th className="px-4 py-3 text-right font-medium">잔액</th>
                </tr>
              </thead>
              <tbody>
                {credits.transactions.map((tx) => (
                  <tr key={tx.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 text-slate-500">{formatDate(tx.created_at)}</td>
                    <td className="px-4 py-3">{txTypeLabels[tx.tx_type] ?? tx.tx_type}</td>
                    <td className="px-4 py-3 text-slate-500">{tx.memo ?? "-"}</td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${tx.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {tx.amount >= 0 ? "+" : ""}
                      {tx.amount.toLocaleString()}P
                    </td>
                    <td className="px-4 py-3 text-right text-slate-950">
                      {tx.balance_after.toLocaleString()}P
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-white px-4 py-5 text-sm text-slate-500">
            아직 거래 내역이 없습니다.
          </p>
        )}
      </Panel>

      {credits?.isAdmin ? <ApiClientsPanel /> : null}
    </div>
  );
}

function GrantForm({ onGranted }: { onGranted: () => void }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");
    try {
      const result = await fetchJson<{ success: true; balance: number }>(
        "/api/admin/credits/grant",
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ email, amount: Number(amount), memo }),
        },
      );
      setMessage(
        `지급 완료. ${email}의 잔액은 ${result.balance.toLocaleString()}P입니다.`,
      );
      setEmail("");
      setAmount("");
      setMemo("");
      onGranted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "포인트 지급에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Panel className="p-5">
      <h2 className="text-lg font-semibold">포인트 지급 (관리자)</h2>
      <p className="mt-1 text-sm text-slate-500">
        입금(결제)을 확인한 뒤 해당 사용자 계정에 포인트를 적립합니다. 음수를
        입력하면 차감 조정됩니다.
      </p>
      <form className="mt-4 grid gap-3" onSubmit={submit}>
        <Field
          label="대상 이메일"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="creator@example.com"
        />
        <Field
          label="지급 포인트"
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="10000"
        />
        <Field
          label="메모 (선택)"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예: 7월 5일 계좌이체 10,000원"
        />
        {message ? <Alert tone="success">{message}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" disabled={submitting || !email || !amount}>
          <Send size={17} aria-hidden="true" />
          {submitting ? "지급 중" : "포인트 지급"}
        </Button>
      </form>
    </Panel>
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
            로 투표를 생성할 수 있는 키를 발급합니다. 키로 생성되는 투표는
            소유자 포인트 계정에서 차감됩니다.
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
