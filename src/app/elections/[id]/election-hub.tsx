"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, LayoutDashboard, ShieldCheck, Vote } from "lucide-react";
import { CodeEntry } from "@/components/code-entry";
import { Alert, Badge, Button, Panel } from "@/components/ui";
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
              <Panel className="grid gap-4 p-5">
                <p className="break-keep text-sm leading-6 text-slate-700">
                  <Vote className="mb-2 text-blue-600" size={22} aria-hidden="true" />
                  문자의 링크를 누르거나, 문자에 있는 <strong>투표 코드</strong>를 여기에 입력하세요.
                </p>
                <CodeEntry compact />
                <ResendForm electionId={election.id} />
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

/** 코드를 잃어버린 유권자 본인 재발송(1회). 결과와 상관없이 같은 안내를 보여 준다(번호 떠보기 방지). */
function ResendForm({ electionId }: { electionId: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchJson<{ message: string }>("/api/vote/resend", {
        method: "POST",
        body: JSON.stringify({ electionId, phone }),
      });
      setMessage(result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-sm text-slate-500 underline underline-offset-2 hover:text-slate-800"
      >
        코드를 잃어버렸어요
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border-t border-[var(--border)] pt-4">
      <p className="break-keep text-sm leading-6 text-slate-600">
        명부에 등록된 휴대폰 번호를 넣으면 새 링크와 코드를 <strong>한 번</strong> 다시 보내 드립니다.
        예전 링크와 코드는 더 쓸 수 없습니다.
      </p>
      <div className="flex gap-2">
        <input
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="010-0000-0000"
          autoComplete="tel"
          className="h-12 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <Button type="submit" disabled={sending || !!message} className="h-12 shrink-0">
          {sending ? "보내는 중" : "다시 받기"}
        </Button>
      </div>
      {message ? <Alert tone="success">{message}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
