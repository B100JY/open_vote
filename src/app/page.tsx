"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { Badge, EmptyState, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Election } from "@/lib/types";
import { formatDateShort, statusLabel, statusTone } from "@/lib/utils";

export default function HomePage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<{ elections: Election[] }>("/api/elections?visibility=public")
      .then((data) => setElections(data.elections))
      .catch(() => setElections([]))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = elections.filter((election) => election.status === "active").length;
  const closedCount = elections.filter((election) => election.status === "closed").length;

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div className="flex flex-col justify-center">
            <Badge className="mb-4 w-fit border-blue-200 bg-blue-50 text-blue-700">
              익명성과 투명성을 분리한 투표 시스템
            </Badge>
            <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
              Open Vote
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              로그인 신원과 기표 데이터를 분리해 무기명 투표를 유지하면서, 진행률과
              결과 집계를 공개할 수 있는 투표 앱입니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/vote"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Vote size={18} aria-hidden="true" />
                투표하기
              </Link>
              <Link
                href="/trust"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                <ShieldCheck size={18} aria-hidden="true" />
                보안 기술 확인
              </Link>
              <Link
                href="/admin"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                <ClipboardList size={18} aria-hidden="true" />
                투표 생성
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric label="진행 중" value={loading ? "-" : activeCount} />
            <Metric label="종료" value={loading ? "-" : closedCount} />
            <LinkMetric
              href="/dashboard"
              label="진행률"
              icon={<LayoutDashboard size={22} aria-hidden="true" />}
            />
            <LinkMetric
              href="/results"
              label="결과"
              icon={<BarChart3 size={22} aria-hidden="true" />}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">공개 선거</h2>
          <Link
            href="/vote"
            className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
          >
            전체 보기
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : elections.length === 0 ? (
          <EmptyState
            icon={<Vote size={28} aria-hidden="true" />}
            title="공개된 선거가 없습니다"
            description="진행 중이거나 종료된 선거가 있으면 이곳에 표시됩니다."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {elections.slice(0, 4).map((election) => (
              <Link key={election.id} href={`/vote/${election.id}/auth`}>
                <Panel className="h-full p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge className={statusTone(election.status)}>
                        {statusLabel(election.status)}
                      </Badge>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">
                        {election.name}
                      </h3>
                    </div>
                    <ArrowRight className="text-slate-400" size={20} aria-hidden="true" />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
                    {election.description || "설명이 등록되지 않았습니다."}
                  </p>
                  <div className="mt-4 flex gap-4 text-sm text-slate-500">
                    <span>등록 유권자 {election.total_voter_codes}명</span>
                    <span>{formatDateShort(election.starts_at)}</span>
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-5">
      <div className="text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function LinkMetric({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-28 flex-col justify-between rounded-lg border border-[var(--border)] bg-slate-50 p-5 text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <Panel className="p-5">
      <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
    </Panel>
  );
}
