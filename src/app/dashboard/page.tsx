"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Users, Vote } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Panel, ProgressBar } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election, ElectionStats } from "@/lib/types";
import {
  formatDate,
  percentage,
  statusLabel,
  statusTone,
} from "@/lib/utils";

export default function DashboardPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [stats, setStats] = useState<ElectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const election = useMemo(
    () => elections.find((item) => item.id === selectedElectionId) ?? null,
    [elections, selectedElectionId],
  );

  const loadElections = useCallback(async () => {
    const data = await fetchJson<{ elections: Election[] }>(
      "/api/elections?status=active",
    );
    setElections(data.elections);
    setSelectedElectionId((current) => current || data.elections[0]?.id || "");
    return data.elections[0]?.id || "";
  }, []);

  const loadStats = useCallback(async (id: string) => {
    if (!id) {
      return;
    }

    const data = await fetchJson<{ stats: ElectionStats }>(
      `/api/elections/${id}/stats`,
    );
    setStats(data.stats);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const firstId = await loadElections();
      await loadStats(selectedElectionId || firstId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대시보드 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadElections, loadStats, selectedElectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedElectionId) {
      return;
    }

    loadStats(selectedElectionId).catch(() => undefined);

    const timer = window.setInterval(() => {
      loadStats(selectedElectionId).catch(() => undefined);
    }, 5000);

    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`dashboard-${selectedElectionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ballots",
          filter: `election_id=eq.${selectedElectionId}`,
        },
        () => {
          loadStats(selectedElectionId).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      if (channel) {
        supabase?.removeChannel(channel);
      }
    };
  }, [loadStats, selectedElectionId]);

  const voterStats = stats?.voter_registry ?? stats?.voter_codes;
  const total = voterStats?.total ?? 0;
  const used = voterStats?.used ?? 0;
  const remaining = voterStats?.remaining ?? 0;
  const progress = Number(stats?.progress ?? 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">투표 진행률</h1>
          <p className="mt-1 text-sm text-slate-500">
            서버 집계 기준으로 주기적으로 업데이트됩니다.
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
          <div className="mt-6 h-3 w-full animate-pulse rounded bg-slate-100" />
        </Panel>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<Vote size={28} aria-hidden="true" />}
          title="진행 중인 선거가 없습니다"
          description="진행 상태인 선거가 있으면 참여율과 투표 현황이 표시됩니다."
        />
      ) : (
        <>
          <Panel className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge className={statusTone(election?.status)}>
                  {statusLabel(election?.status)}
                </Badge>
                <h2 className="mt-3 text-xl font-semibold text-slate-950">
                  {election?.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  종료 {formatDate(election?.ends_at)}
                </p>
              </div>
              <select
                className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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

          <Panel className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">투표 진행률</h2>
                <p className="mt-1 text-sm text-slate-500">
                  유권자 명부 기준 참여율
                </p>
              </div>
              <span className="text-3xl font-semibold text-blue-700">
                {percentage(progress)}
              </span>
            </div>
            <div className="mt-5">
              <ProgressBar value={progress} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Stat label="참여" value={`${used}명`} />
              <Stat label="전체" value={`${total}명`} />
              <Stat label="미참여" value={`${remaining}명`} />
            </div>
          </Panel>

          <div className="grid gap-3 md:grid-cols-3">
            <InfoCard
              icon={<Vote size={24} aria-hidden="true" />}
              label="총 투표수"
              value={stats?.ballots.total ?? 0}
            />
            <InfoCard
              icon={<Users size={24} aria-hidden="true" />}
              label="등록 유권자"
              value={total}
            />
            <InfoCard
              icon={<Activity size={24} aria-hidden="true" />}
              label="사용됨"
              value={used}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 text-center">
      <div className="text-xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          {icon}
        </span>
        <div>
          <div className="text-2xl font-semibold text-slate-950">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </div>
      </div>
    </Panel>
  );
}
