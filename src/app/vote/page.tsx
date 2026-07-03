"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Vote } from "lucide-react";
import { Badge, Button, EmptyState, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Election } from "@/lib/types";
import { formatDate, statusLabel, statusTone } from "@/lib/utils";

export default function VoteSelectPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ elections: Election[] }>(
        "/api/elections?status=active",
      );
      setElections(data.elections);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "선거 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">투표하기</h1>
          <p className="mt-1 text-sm text-slate-500">
            진행 중인 선거만 표시됩니다.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton />
          <Skeleton />
        </div>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<Vote size={28} aria-hidden="true" />}
          title="진행 중인 선거가 없습니다"
          description="관리자가 선거를 시작하면 이곳에서 인증 후 투표할 수 있습니다."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {elections.map((election) => (
            <Link key={election.id} href={`/vote/${election.id}/auth`}>
              <Panel className="h-full p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <Badge className={statusTone(election.status)}>
                    {statusLabel(election.status)}
                  </Badge>
                  <ArrowRight size={20} className="text-slate-400" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-950">
                  {election.name}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                  {election.description || "설명이 등록되지 않았습니다."}
                </p>
                <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
                  <span>등록 유권자 {election.total_voter_codes}명</span>
                  <span>종료 {formatDate(election.ends_at)}</span>
                </div>
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <Panel className="p-5">
      <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
    </Panel>
  );
}
