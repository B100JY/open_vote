"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Search, ShieldCheck, Vote } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { electionNumber, matchesElectionQuery } from "@/lib/election-search";
import type { Election } from "@/lib/types";
import { formatDateShort, statusLabel, statusTone } from "@/lib/utils";

const LIST_LIMIT = 8;

export default function HomePage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchJson<{ elections: Election[] }>("/api/elections?visibility=public")
      .then((data) => setElections(data.elections))
      .catch(() => setElections([]))
      .finally(() => setLoading(false));
  }, []);

  const searching = query.trim().length > 0;
  // 평소에는 진행 중인 투표만, 검색하면 끝난 투표까지 찾는다.
  const shown = useMemo(
    () =>
      (searching
        ? elections.filter((election) => matchesElectionQuery(election, query))
        : elections.filter((election) => election.status === "active")
      ).slice(0, LIST_LIMIT),
    [elections, query, searching],
  );

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 pt-2 sm:pt-6">
      <section className="text-center">
        <h1 className="text-3xl font-semibold text-slate-950 sm:text-4xl">모아이</h1>
        <p className="mt-3 break-keep text-base leading-7 text-slate-600">
          문자로 받은 링크를 누르면 바로 투표할 수 있습니다.
          <br className="hidden sm:block" /> 누가 누구를 뽑았는지는 운영자도 알 수 없습니다.
        </p>
      </section>

      <label className="relative block">
        <span className="sr-only">투표 찾기</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          size={20}
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="투표 번호나 이름으로 찾기"
          className="h-14 w-full rounded-xl border border-[var(--border)] bg-white pl-12 pr-4 text-base shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      <section className="grid gap-2" aria-live="polite">
        <h2 className="px-1 text-sm font-semibold text-slate-500">
          {searching ? "찾은 투표" : "진행 중인 공개 투표"}
        </h2>
        {loading ? (
          <Panel className="p-4 text-sm text-slate-400">불러오는 중</Panel>
        ) : shown.length === 0 ? (
          <Panel className="p-5 text-center text-sm leading-6 text-slate-500">
            {searching
              ? "찾는 투표가 없습니다. 투표 번호를 다시 확인해 주세요."
              : "지금 진행 중인 공개 투표가 없습니다."}
          </Panel>
        ) : (
          <ul className="grid gap-2">
            {shown.map((election) => (
              <li key={election.id}>
                <Link href={`/elections/${election.id}`}>
                  <Panel className="flex items-center justify-between gap-3 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={statusTone(election.status)}>{statusLabel(election.status)}</Badge>
                        <span className="text-xs text-slate-400">No. {electionNumber(election.id)}</span>
                      </div>
                      <h3 className="mt-2 truncate text-base font-semibold text-slate-950">{election.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateShort(election.starts_at)} ~ {formatDateShort(election.ends_at)}
                      </p>
                    </div>
                    <ArrowRight className="shrink-0 text-slate-400" size={20} aria-hidden="true" />
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
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
