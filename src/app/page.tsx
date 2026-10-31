"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, LockKeyhole, Search, ShieldCheck, Vote, X } from "lucide-react";
import { Alert, Badge, Panel, ProgressBar } from "@/components/ui";
import { CodeEntry } from "@/components/code-entry";
import { fetchJson } from "@/lib/client-fetch";
import { electionNumber, matchesElectionQuery } from "@/lib/election-search";
import { MoaiIcon } from "@/components/moai-icon";
import { publicPeriodDate, type PublicElectionSummary } from "@/lib/public-election-summary";


export default function HomePage() {
  const [elections, setElections] = useState<PublicElectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ elections: PublicElectionSummary[] }>("/api/elections/public-summary")
      .then((data) => { if (!cancelled) setElections(data.elections); })
      .catch(() => { if (!cancelled) setError("공개 투표를 불러오지 못했습니다. 잠시 후 다시 방문해주세요."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const query = search.trim();
  const filtered = elections.filter((election) => matchesElectionQuery(election, query));

  return (
    <div className="compact-home">
      <section className="home-intro" aria-labelledby="hero-title">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600"><MoaiIcon width={60} height={60} /></div>
        <h1 id="hero-title">모두의 선택을 모으는<br /><span>모아이투표</span></h1>
        <p className="intro-description">쉽게 참여하고, 투명하게 확인하는 투표 서비스.</p>
        <div className="vote-entry">
          <CodeEntry title="투표 코드로 참여하기" />
          <p className="mt-2 text-sm leading-6 text-slate-500">문자로 받은 6자리 코드를 입력해주세요.</p>
        </div>
        <div className="intro-links">
          <Link href="/trust"><ShieldCheck size={15} aria-hidden="true" /> 이용 안내</Link>
          <span aria-hidden="true" className="h-3 w-px bg-slate-200" />
          <Link href="/admin"><ClipboardList size={15} aria-hidden="true" /> 투표 생성</Link>
        </div>
      </section>

      <section className="public-votes" aria-labelledby="public-elections">
        <div className="public-votes-heading">
          <h2 id="public-elections" className="section-title">공개 투표</h2>
          <div className="vote-search" role="search" aria-label="공개 투표 검색">
            <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            <label htmlFor="vote-search" className="sr-only">공개 투표 검색</label>
            <input id="vote-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="투표 번호나 이름 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            {search ? <button type="button" aria-label="검색어 지우기" onClick={() => setSearch("")} className="grid h-7 w-7 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-100"><X size={14} aria-hidden="true" /></button> : null}
          </div>
        </div>
        {error ? <Alert>{error}</Alert> : loading ? (
          <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="공개 투표 불러오는 중">
            {[0, 1].map((key) => <Panel key={key} className="p-5"><div className="h-5 w-16 animate-pulse rounded bg-slate-100" /><div className="mt-4 h-5 w-2/3 animate-pulse rounded bg-slate-100" /></Panel>)}
          </div>
        ) : filtered.length === 0 ? (
          <div role="status" className="compact-empty">
            <Vote size={24} strokeWidth={1.5} className="mb-3 text-slate-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-600">{query ? "검색 결과가 없습니다" : "현재 표시할 공개 투표가 없습니다"}</p>
            {query ? <p className="mt-1 text-sm text-slate-500">다른 투표명으로 검색해주세요.</p> : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((election) => (
              <Link key={election.id} href={`/elections/${election.id}`} className="election-card">
                <div className="flex items-center justify-between gap-3"><Badge className={election.status === "closed" ? "border-slate-200 bg-slate-100 text-slate-600" : election.status === "scheduled" ? "border-blue-100 bg-blue-50 text-blue-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}>{election.status === "closed" ? "종료" : election.status === "scheduled" ? "시작 예정" : "진행 중"}</Badge><ArrowRight size={16} className="text-slate-400" aria-hidden="true" /></div>
                {election.organization_name ? <p className="mt-3 text-xs font-medium text-blue-700">{election.organization_name}</p> : null}
                <h3 className="mt-3 text-base font-semibold text-slate-800">{election.name}</h3>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div className="flex gap-3"><dt className="w-7 shrink-0 text-slate-400">기간</dt><dd className="flex flex-wrap gap-x-1"><span>{publicPeriodDate(election.starts_at)} ~</span><span>{publicPeriodDate(election.ends_at)}</span></dd></div>
                  <div className="flex gap-3"><dt className="w-7 shrink-0 text-slate-400">대상</dt><dd>{election.audience_label}</dd></div>
                </dl>
                {election.content_restricted ? <p className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><LockKeyhole size={14} aria-hidden="true" />내용·결과는 투표 링크나 코드로 확인</p> : <>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500"><span>No. {electionNumber(election.id)}</span><span>{election.deadline_label}</span></p>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-500">투표 참여율</span>
                    <span className="font-medium text-blue-700">{election.participation_rate == null ? "확인 불가" : `${election.participation_rate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`}</span>
                  </div>
                  {election.participation_rate != null ? <ProgressBar value={election.participation_rate} /> : null}
                </div>
                </>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/trust"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <ShieldCheck size={18} aria-hidden="true" />
          보안 기술 확인
        </Link>
        <Link
          href="/admin"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          <ClipboardList size={18} aria-hidden="true" />
          투표 생성
        </Link>
      </div>

      <p className="text-center text-xs leading-5 text-slate-400">
        <Vote className="mr-1 inline" size={14} aria-hidden="true" />
        투표에 참여할 때는 가입이 필요 없습니다.
        <span className="mx-2">·</span>
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
      </p>
    </div>
  );
}
