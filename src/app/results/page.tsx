"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Lock, RefreshCw, Trophy } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Panel, ProgressBar } from "@/components/ui";
import { ballotTypeLabel } from "@/lib/ballot";
import { fetchJson } from "@/lib/client-fetch";
import { pickElectionId } from "@/lib/election-search";
import type { CandidateResult, Election, ElectionResults } from "@/lib/types";
import { formatDate, percentage, statusLabel, statusTone } from "@/lib/utils";

type ResultsResponse = {
  election: Election;
  results: ElectionResults | null;
  message?: string;
};

type Row = CandidateResult & { name: string };

export default function ResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadResults = useCallback(async (id: string) => {
    if (!id) {
      return;
    }
    setData(await fetchJson<ResultsResponse>(`/api/elections/${id}/results`));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchJson<{ elections: Election[] }>("/api/elections?visibility=public");
      setElections(list.elections);
      const id = selectedElectionId || pickElectionId(list.elections, window.location.search);
      setSelectedElectionId(id);
      await loadResults(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadResults, selectedElectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 진행 중인 선거는 종료되는 순간 결과가 열리도록 가끔 다시 확인한다
  const closed = data?.election.status === "closed";
  useEffect(() => {
    if (!selectedElectionId || closed) {
      return;
    }
    const timer = window.setInterval(() => {
      loadResults(selectedElectionId).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [closed, loadResults, selectedElectionId]);

  const election = data?.election ?? null;
  const results = data?.results ?? null;

  const rows = useMemo<Row[]>(() => {
    if (!election || !results) {
      return [];
    }
    const named = results.candidates.map((row) => ({
      ...row,
      name: election.candidates.find((candidate) => candidate.id === row.candidate_id)?.name ?? row.candidate_id,
    }));
    const key = (row: Row) =>
      results.ballot_type === "approve"
        ? (row.yes ?? 0) - (row.no ?? 0)
        : results.ballot_type === "rank"
          ? (row.points ?? 0)
          : (row.votes ?? 0);
    return named.sort((a, b) => key(b) - key(a));
  }, [election, results]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">투표 결과</h1>
          <p className="mt-1 text-sm text-slate-500">결과는 투표가 종료된 뒤에만 공개됩니다.</p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading && !data ? (
        <Panel className="p-6">
          <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-20 w-full animate-pulse rounded bg-slate-100" />
        </Panel>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} aria-hidden="true" />}
          title="결과를 확인할 수 있는 선거가 없습니다"
          description="진행 중이거나 종료된 선거가 있으면 여기에 표시됩니다."
        />
      ) : (
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusTone(election?.status)}>{statusLabel(election?.status)}</Badge>
                  {election ? <Badge>{ballotTypeLabel(election.ballot_type)}</Badge> : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">{election?.name}</h2>
              </div>
              <select
                className="h-11 max-w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                value={selectedElectionId}
                onChange={(event) => setSelectedElectionId(event.target.value)}
              >
                {elections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </Panel>

          {!results ? (
            <EmptyState
              icon={<Lock size={28} aria-hidden="true" />}
              title="투표가 끝나면 결과가 공개됩니다"
              description={`마감 ${formatDate(election?.ends_at)}. 진행 중에는 관리자도 중간 결과를 볼 수 없습니다.`}
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Total label="총 투표수" value={results.total_ballots} />
                <Total label="유효표" value={results.valid_ballots} />
                <Total label="기권" value={results.blank_ballots} />
              </div>

              {results.ballot_type === "approve" ? (
                <ApproveRows rows={rows} />
              ) : results.ballot_type === "rank" ? (
                <RankRows rows={rows} maxRank={results.max_choices} />
              ) : (
                <VoteRows rows={rows} seats={results.ballot_type === "multi" ? results.max_choices : 1} />
              )}

              <p className="text-xs leading-5 text-slate-500">
                {results.ballot_type === "multi"
                  ? `득표율은 유효표(투표한 사람) 중 그 항목을 고른 비율입니다. 한 사람이 최대 ${results.max_choices}개까지 골랐으므로 합계가 100%를 넘습니다. `
                  : results.ballot_type === "rank"
                    ? `순위 점수는 1순위 ${results.max_choices}점, 그다음 순위마다 1점씩 낮게 매긴 합계입니다. `
                    : ""}
                당선·가결 판단 기준(과반, 투표율 등)은 각 조합의 선거관리규정을 따릅니다.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="p-5 text-center">
      <div className="text-3xl font-semibold text-slate-950">{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </Panel>
  );
}

function RankBadge({ index, highlight }: { index: number; highlight: boolean }) {
  return highlight ? (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
      <Trophy size={19} aria-hidden="true" />
    </span>
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500">
      #{index + 1}
    </span>
  );
}

function VoteRows({ rows, seats }: { rows: Row[]; seats: number }) {
  return (
    <section className="grid gap-3">
      {rows.map((row, index) => (
        <Panel key={row.candidate_id} className="p-5">
          <div className="flex items-center gap-3">
            <RankBadge index={index} highlight={index < seats && (row.votes ?? 0) > 0} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <h3 className="truncate text-lg font-semibold text-slate-950">{row.name}</h3>
                <div className="text-right">
                  <div className="font-semibold text-blue-700">{row.votes ?? 0}표</div>
                  <div className="text-xs text-slate-500">{percentage(row.percentage ?? 0)}</div>
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar value={row.percentage ?? 0} />
              </div>
            </div>
          </div>
        </Panel>
      ))}
    </section>
  );
}

function ApproveRows({ rows }: { rows: Row[] }) {
  return (
    <section className="grid gap-3">
      {rows.map((row) => (
        <Panel key={row.candidate_id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{row.name}</h3>
            <div className="flex gap-4 text-sm">
              <span className="font-semibold text-blue-700">찬성 {row.yes ?? 0}</span>
              <span className="font-semibold text-red-600">반대 {row.no ?? 0}</span>
              <span className="text-slate-500">찬성률 {percentage(row.yes_percentage ?? 0)}</span>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar value={row.yes_percentage ?? 0} />
          </div>
        </Panel>
      ))}
    </section>
  );
}

function RankRows({ rows, maxRank }: { rows: Row[]; maxRank: number }) {
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">항목</th>
            <th className="px-4 py-3 text-right font-medium">순위 점수</th>
            <th className="px-4 py-3 text-right font-medium">1순위</th>
            {Array.from({ length: maxRank }, (_, rank) => (
              <th key={rank} className="px-3 py-3 text-right font-medium">
                {rank + 1}위
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidate_id} className="border-t border-[var(--border)]">
              <td className="px-4 py-3 font-medium text-slate-950">{row.name}</td>
              <td className="px-4 py-3 text-right font-semibold text-blue-700">{row.points ?? 0}</td>
              <td className="px-4 py-3 text-right">
                {row.first_choice ?? 0} <span className="text-xs text-slate-500">({percentage(row.percentage ?? 0)})</span>
              </td>
              {Array.from({ length: maxRank }, (_, rank) => (
                <td key={rank} className="px-3 py-3 text-right text-slate-600">
                  {row.rank_counts?.[rank] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
