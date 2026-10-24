"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, LayoutDashboard, ShieldCheck, Vote } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { electionNumber } from "@/lib/election-search";
import type { Election } from "@/lib/types";
import { formatDate, statusLabel, statusTone } from "@/lib/utils";

type ElectionResponse = { election: Election; cast_count: number; voter_count: number };

/** 홈에서 찾거나 누른 투표 하나의 안내 화면. 투표·진행 상황·결과·검증으로 가는 길을 한곳에 모은다. */
export function ElectionHub({ electionId }: { electionId: string }) {
  const [data, setData] = useState<ElectionResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<ElectionResponse>(`/api/elections/${encodeURIComponent(electionId)}`)
      .then(setData)
      .catch(() => setError("투표를 찾을 수 없습니다. 투표 번호나 주소를 다시 확인해 주세요."));
  }, [electionId]);

  const back = (
    <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700">
      <ArrowLeft size={16} aria-hidden="true" /> 다른 투표 찾기
    </Link>
  );

  if (error) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        {back}
        <Panel className="p-6 text-center text-sm text-slate-600">{error}</Panel>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        {back}
        <Panel className="p-6 text-center text-sm text-slate-400">불러오는 중</Panel>
      </div>
    );
  }

  const { election } = data;
  const id = encodeURIComponent(election.id);
  const isPublic = election.status === "active" || election.status === "closed";
  const closed = election.status === "closed";
  const smsOnly = election.auth_mode === "sms_token";

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      {back}
      <Panel className="p-6">
        <div className="flex items-center gap-2">
          <Badge className={statusTone(election.status)}>{statusLabel(election.status)}</Badge>
          <span className="text-xs text-slate-400">투표 번호 {electionNumber(election.id)}</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">{election.name}</h1>
        {election.description ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{election.description}</p>
        ) : null}
        <dl className="mt-4 grid gap-1 text-sm text-slate-600">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-slate-400">기간</dt>
            <dd>
              {formatDate(election.starts_at)} ~ {formatDate(election.ends_at)}
            </dd>
          </div>
          {isPublic ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-400">참여</dt>
              <dd>
                {data.cast_count.toLocaleString()}명 / {data.voter_count.toLocaleString()}명
              </dd>
            </div>
          ) : null}
        </dl>
      </Panel>

      {!isPublic ? (
        <Panel className="p-5 text-center text-sm leading-6 text-slate-600">
          아직 시작하지 않았거나 잠시 멈춘 투표입니다.
        </Panel>
      ) : (
        <div className="grid gap-3">
          {election.status === "active" ? (
            smsOnly ? (
              <Panel className="p-5 text-sm leading-6 text-slate-700">
                <Vote className="mb-2 text-blue-600" size={22} aria-hidden="true" />
                이 투표는 <strong>문자로 받은 개인 링크</strong>로 참여합니다. 문자의 링크를 눌러 주세요.
              </Panel>
            ) : (
              <ActionLink href={`/vote/${id}/auth`} primary icon={<Vote size={18} aria-hidden="true" />}>
                투표하기
              </ActionLink>
            )
          ) : null}
          {/* 진행률 화면은 진행 중인 투표만 다룬다. 끝난 투표의 참여 수는 결과 화면에 있다. */}
          {!closed ? (
            <ActionLink href={`/dashboard?election=${id}`} icon={<LayoutDashboard size={18} aria-hidden="true" />}>
              진행 상황 보기
            </ActionLink>
          ) : null}
          {closed ? (
            <>
              <ActionLink href={`/results?election=${id}`} icon={<BarChart3 size={18} aria-hidden="true" />}>
                결과 보기
              </ActionLink>
              <ActionLink href={`/verify?election=${id}`} icon={<ShieldCheck size={18} aria-hidden="true" />}>
                내 표가 제대로 세어졌는지 확인
              </ActionLink>
            </>
          ) : (
            <p className="px-1 text-center text-xs text-slate-500">결과는 투표가 끝나면 이곳에서 볼 수 있습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ActionLink({
  href,
  icon,
  primary = false,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white transition hover:bg-blue-700"
          : "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
      }
    >
      {icon}
      {children}
    </Link>
  );
}
