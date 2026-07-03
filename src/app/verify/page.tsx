"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Field, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Election, PublicBallotLedger } from "@/lib/types";
import { normalizeReceiptInput, verifyLedgerChain } from "@/lib/verification";

type LedgerResponse = {
  election: Election;
  ledger: PublicBallotLedger;
};

export default function VerifyPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [ledger, setLedger] = useState<PublicBallotLedger | null>(null);
  const [receiptQuery, setReceiptQuery] = useState("");
  const [chainStatus, setChainStatus] = useState<{
    valid: boolean;
    brokenAt: number | null;
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
    setLedger(data.ledger);
    setChainStatus(await verifyLedgerChain(id, data.ledger.ballots));
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
            영수증 해시 검색과 해시 체인 검증을 브라우저에서 수행합니다.
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

          <div className="grid gap-3 md:grid-cols-3">
            <StatusCard
              label="Ledger 투표수"
              value={`${ledger?.ballot_count ?? 0}건`}
              icon={<Search size={22} aria-hidden="true" />}
            />
            <StatusCard
              label="체인 검증"
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
              label="최종 체인 해시"
              value={ledger?.final_chain_hash?.slice(0, 12) ?? "-"}
              icon={<ShieldCheck size={22} aria-hidden="true" />}
            />
          </div>

          {receipt ? (
            matchedBallot ? (
              <Alert tone="success">
                영수증을 찾았습니다. 공개 ledger 순번 {matchedBallot.sequence_number}번,
                선택 항목 ID는 {matchedBallot.selected_candidate}입니다.
              </Alert>
            ) : (
              <Alert>현재 공개 ledger에서 이 영수증 해시를 찾지 못했습니다.</Alert>
            )
          ) : null}

          {chainStatus && !chainStatus.valid ? (
            <Alert>
              해시 체인이 {chainStatus.brokenAt}번에서 깨졌습니다: {chainStatus.reason}
            </Alert>
          ) : null}

          <Panel className="overflow-hidden">
            <div className="border-b border-[var(--border)] p-4">
              <h2 className="text-lg font-semibold">공개 Ledger</h2>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">순번</th>
                    <th className="px-4 py-3 font-medium">선택 항목</th>
                    <th className="px-4 py-3 font-medium">영수증 해시</th>
                    <th className="px-4 py-3 font-medium">체인 해시</th>
                  </tr>
                </thead>
                <tbody>
                  {(ledger?.ballots ?? []).map((ballot) => (
                    <tr key={ballot.sequence_number} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">{ballot.sequence_number}</td>
                      <td className="px-4 py-3">{ballot.selected_candidate}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ballot.receipt_hash}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ballot.chain_hash}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
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
