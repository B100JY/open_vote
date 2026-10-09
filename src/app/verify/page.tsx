"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Lock, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Field, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Election, PublicBallotLedger } from "@/lib/types";
import { describeSelection } from "@/lib/ballot";
import { normalizeReceiptInput, verifyLedger } from "@/lib/verification";

type LedgerResponse = {
  election: Election;
  ledger: PublicBallotLedger | null;
  message?: string;
};

export default function VerifyPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [ledger, setLedger] = useState<PublicBallotLedger | null>(null);
  const [ledgerElection, setLedgerElection] = useState<Election | null>(null);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [chainStatus, setChainStatus] = useState<{
    valid: boolean;
    reason: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const receipt = normalizeReceiptInput(receiptQuery);
  const matchedBallot = useMemo(() => {
    if (!receipt || !ledger) {
      return null;
    }

    return ledger.ballots.find((ballot) => ballot.receipt_hash === receipt) ?? null;
  }, [ledger, receipt]);

  async function loadElections() {
    const data = await fetchJson<{ elections: Election[] }>(
      "/api/elections?visibility=public",
    );
    setElections(data.elections);
    setSelectedElectionId((current) => current || data.elections[0]?.id || "");
    return currentOrFirst(selectedElectionId, data.elections);
  }

  async function loadLedger(id: string) {
    if (!id) {
      setLedger(null);
      return;
    }

    const data = await fetchJson<LedgerResponse>(`/api/elections/${id}/ledger`);
    setLedgerElection(data.election);
    setLedger(data.ledger);
    setChainStatus(data.ledger ? await verifyLedger(data.ledger.ballots, data.ledger.ledger_hash) : null);
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const id = await loadElections();
      await loadLedger(selectedElectionId || id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "검증 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedElectionId) {
      return;
    }

    loadLedger(selectedElectionId).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "검증 데이터를 불러오지 못했습니다.");
    });
  }, [selectedElectionId]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">공개 투표 검증</h1>
          <p className="mt-1 text-sm text-slate-500">
            투표 종료 후 공개 원장에서 내 영수증을 찾고, 원장 해시를 브라우저에서 다시 계산해 확인합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/trust"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Info size={18} aria-hidden="true" />
            기술 원리
          </Link>
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw size={18} aria-hidden="true" />
            새로고침
          </Button>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <Panel className="p-6">
          <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-3 w-full animate-pulse rounded bg-slate-100" />
        </Panel>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28} aria-hidden="true" />}
          title="검증 가능한 선거가 없습니다"
          description="진행 중이거나 종료된 선거가 있으면 공개 ledger를 확인할 수 있습니다."
        />
      ) : (
        <>
          <Panel className="p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
              <Field
                label="영수증 해시 검색"
                value={receiptQuery}
                onChange={(event) => setReceiptQuery(event.target.value)}
                placeholder="투표 완료 화면에서 받은 64자리 해시"
              />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">선거</span>
                <select
                  className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={selectedElectionId}
                  onChange={(event) => setSelectedElectionId(event.target.value)}
                >
                  {elections.map((election) => (
                    <option key={election.id} value={election.id}>
                      {election.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>

          {!ledger ? (
            <EmptyState
              icon={<Lock size={28} aria-hidden="true" />}
              title="투표가 끝나면 공개 원장이 열립니다"
              description="진행 중에 원장을 공개하면 표가 쌓이는 순서로 누가 무엇을 찍었는지 추정할 수 있어 종료 후에만 공개합니다."
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <StatusCard
                  label="원장 투표수"
                  value={`${ledger.ballot_count}건`}
                  icon={<Search size={22} aria-hidden="true" />}
                />
                <StatusCard
                  label="원장 해시 검증"
                  value={chainStatus?.valid ? "정상" : "오류"}
                  icon={
                    chainStatus?.valid ? (
                      <CheckCircle2 size={22} aria-hidden="true" />
                    ) : (
                      <XCircle size={22} aria-hidden="true" />
                    )
                  }
                  tone={chainStatus?.valid ? "success" : "danger"}
                />
                <StatusCard
                  label="원장 해시"
                  value={ledger.ledger_hash.slice(0, 12)}
                  icon={<ShieldCheck size={22} aria-hidden="true" />}
                />
              </div>

              {receipt ? (
                matchedBallot ? (
                  <Alert tone="success">
                    영수증을 찾았습니다. 원장에 기록된 선택은 &ldquo;
                    {describeSelection(matchedBallot.selection, ledgerElection?.candidates ?? [])}
                    &rdquo;입니다. 내가 고른 것과 같은지 확인하세요.
                  </Alert>
                ) : (
                  <Alert>공개 원장에서 이 영수증 해시를 찾지 못했습니다.</Alert>
                )
              ) : null}

              {chainStatus && !chainStatus.valid ? <Alert>원장 검증 실패: {chainStatus.reason}</Alert> : null}

              <Panel className="overflow-hidden">
                <div className="border-b border-[var(--border)] p-4">
                  <h2 className="text-lg font-semibold">공개 원장</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    영수증 해시 순서로 정렬되어 있어 투표한 순서는 알 수 없습니다. 전체 해시: {ledger.ledger_hash}
                  </p>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">영수증 해시</th>
                        <th className="px-4 py-3 font-medium">선택</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.ballots.map((ballot) => (
                        <tr key={ballot.receipt_hash} className="border-t border-[var(--border)]">
                          <td className="px-4 py-3 font-mono text-xs">{ballot.receipt_hash}</td>
                          <td className="px-4 py-3">
                            {describeSelection(ballot.selection, ledgerElection?.candidates ?? [])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

function currentOrFirst(current: string, elections: Election[]) {
  return current || elections[0]?.id || "";
}

function StatusCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
        ? "bg-red-50 text-red-700"
        : "bg-blue-50 text-blue-700";

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </span>
        <div>
          <Badge>{label}</Badge>
          <div className="mt-2 break-all text-xl font-semibold text-slate-950">{value}</div>
        </div>
      </div>
    </Panel>
  );
}
