"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, Trophy } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Panel, ProgressBar } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election, VoteResults } from "@/lib/types";
import {
  percentage,
  statusLabel,
  statusTone,
} from "@/lib/utils";

type ResultsResponse = {
  election: Election;
  results: VoteResults;
};

export default function ResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [resultData, setResultData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectedElection = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId],
  );

  const loadElections = useCallback(async () => {
    const data = await fetchJson<{ elections: Election[] }>(
      "/api/elections?visibility=public",
    );
    setElections(data.elections);
    setSelectedElectionId((current) => current || data.elections[0]?.id || "");
    return data.elections[0]?.id || "";
  }, []);

  const loadResults = useCallback(async (id: string) => {
    if (!id) {
      return;
    }

    const data = await fetchJson<ResultsResponse>(`/api/elections/${id}/results`);
    setResultData(data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const firstId = await loadElections();
      await loadResults(selectedElectionId || firstId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadElections, loadResults, selectedElectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedElectionId) {
      return;
    }

    loadResults(selectedElectionId).catch(() => undefined);

    const timer = window.setInterval(() => {
      loadResults(selectedElectionId).catch(() => undefined);
    }, 5000);

    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`results-${selectedElectionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "app_open_vote",
          table: "ballots",
          filter: `election_id=eq.${selectedElectionId}`,
        },
        () => {
          loadResults(selectedElectionId).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      if (channel) {
        supabase?.removeChannel(channel);
      }
    };
  }, [loadResults, selectedElectionId]);

  const rows = useMemo(() => {
    const election = resultData?.election ?? selectedElection;
    const resultMap = new Map(
      (resultData?.results.results ?? []).map((row) => [
        row.candidate_id,
        row,
      ]),
    );

    return (election?.candidates ?? [])
      .map((candidate) => {
        const result = resultMap.get(candidate.id);
        return {
          id: candidate.id,
          name: candidate.name,
          votes: Number(result?.vote_count ?? 0),
          percent: Number(result?.percentage ?? 0),
        };
      })
      .sort((a, b) => b.votes - a.votes);
  }, [resultData, selectedElection]);

  const totalVotes = resultData?.results.total_votes ?? 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">투표 결과</h1>
          <p className="mt-1 text-sm text-slate-500">
            항목별 득표수와 득표율입니다.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <Panel className="p-6">
          <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-20 w-full animate-pulse rounded bg-slate-100" />
        </Panel>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} aria-hidden="true" />}
          title="결과를 확인할 수 있는 선거가 없습니다"
          description="진행 중이거나 종료된 선거가 있으면 결과가 표시됩니다."
        />
      ) : (
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge className={statusTone(resultData?.election.status)}>
                  {statusLabel(resultData?.election.status)}
                </Badge>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">
                  {resultData?.election.name ?? selectedElection?.name}
                </h2>
              </div>
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
            </div>
          </Panel>

          <Panel className="p-6 text-center">
            <BarChart3 className="mx-auto text-blue-700" size={42} aria-hidden="true" />
            <div className="mt-3 text-3xl font-semibold text-blue-700">
              총 {totalVotes}표
            </div>
            <p className="mt-1 text-sm text-slate-500">투표가 집계되었습니다</p>
          </Panel>

          <section className="grid gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              항목별 득표 현황
            </h2>
            {rows.map((row, index) => (
              <Panel key={row.id} className="p-5">
                <div className="flex items-center gap-3">
                  {index === 0 && row.votes > 0 ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Trophy size={19} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-500">
                      #{index + 1}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="truncate text-lg font-semibold text-slate-950">
                        {row.name}
                      </h3>
                      <div className="text-right">
                        <div className="font-semibold text-blue-700">{row.votes}표</div>
                        <div className="text-xs text-slate-500">
                          {percentage(row.percent)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={row.percent} />
                    </div>
                  </div>
                </div>
              </Panel>
            ))}
          </section>

          <Panel className="overflow-hidden">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">순위</th>
                  <th className="px-4 py-3 font-medium">항목</th>
                  <th className="px-4 py-3 text-right font-medium">득표수</th>
                  <th className="px-4 py-3 text-right font-medium">득표율</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">#{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-950">{row.name}</td>
                    <td className="px-4 py-3 text-right">{row.votes}</td>
                    <td className="px-4 py-3 text-right">
                      {percentage(row.percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
