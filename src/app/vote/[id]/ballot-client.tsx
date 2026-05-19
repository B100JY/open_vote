"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Radio, Vote } from "lucide-react";
import { Alert, Button, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election } from "@/lib/types";
import { cx } from "@/lib/utils";
import { createVoteReceipt } from "@/lib/verification";

type VoterStatus = {
  registered: boolean;
  hasVoted: boolean;
  voter?: { email: string };
};

export function BallotClient({ electionId }: { electionId: string }) {
  const router = useRouter();
  const [election, setElection] = useState<Election | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [status, setStatus] = useState<VoterStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [selectedOption, setSelectedOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<{ election: Election }>(`/api/elections/${electionId}`)
      .then((data) => setElection(data.election))
      .catch(() => setElection(null));

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setChecking(false);
      setError("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      return;
    }
    const client = supabase;

    async function loadAuth() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? "";
      setAccessToken(token);

      if (!token) {
        setStatus(null);
        return;
      }

      const voterStatus = await fetchJson<VoterStatus>(
        `/api/auth/status?electionId=${electionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setStatus(voterStatus);
    }

    loadAuth()
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "로그인 상태를 확인하지 못했습니다.");
      })
      .finally(() => setChecking(false));
  }, [electionId]);

  const selectedName = useMemo(() => {
    return election?.candidates.find((candidate) => candidate.id === selectedOption)?.name;
  }, [election, selectedOption]);

  async function submit() {
    if (!accessToken || !status?.registered || status.hasVoted || !selectedOption) {
      return;
    }

    const confirmed = window.confirm(
      `"${selectedName ?? "선택한 항목"}"으로 제출하시겠습니까?\n제출한 투표는 취소할 수 없습니다.`,
    );

    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const receipt = await createVoteReceipt({
        electionId,
        selectedCandidate: selectedOption,
      });
      const response = await fetchJson<{
        success: true;
        receiptHash: string;
        sequenceNumber: number | null;
        chainHash: string | null;
      }>("/api/vote", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          electionId,
          selectedCandidate: selectedOption,
          receiptHash: receipt.receiptHash,
        }),
      });

      localStorage.setItem(
        "open_vote_last_receipt",
        JSON.stringify({
          electionId,
          electionName: election?.name ?? "",
          selectedCandidate: selectedOption,
          selectedName,
          salt: receipt.salt,
          receiptHash: response.receiptHash,
          sequenceNumber: response.sequenceNumber,
          chainHash: response.chainHash,
          savedAt: new Date().toISOString(),
        }),
      );
      router.replace("/vote/complete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "투표 제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">로그인 상태 확인 중</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            유권자 명부와 참여 상태를 확인하고 있습니다.
          </p>
        </Panel>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">로그인이 필요합니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            이메일 매직 링크로 로그인한 뒤 투표할 수 있습니다.
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증하기
          </Link>
        </Panel>
      </div>
    );
  }

  if (status && (!status.registered || status.hasVoted)) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">
            {status.hasVoted ? "이미 투표했습니다" : "등록된 유권자가 아닙니다"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {status.hasVoted
              ? "참여 상태는 투표 완료로 기록되어 있습니다."
              : "현재 로그인한 이메일은 이 선거의 유권자 명부에 없습니다."}
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증 상태 보기
          </Link>
        </Panel>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">유권자 상태를 확인하지 못했습니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error || "잠시 후 다시 시도해주세요."}
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증 화면으로 이동
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">투표 항목 선택</h1>
        <p className="mt-1 text-sm text-slate-500">
          {election?.name ?? "선거 정보를 불러오는 중입니다."}
        </p>
      </div>

      <Alert tone="info">
        <span className="inline-flex items-center gap-2">
          <Info size={17} aria-hidden="true" />
          한 항목만 선택할 수 있습니다.
        </span>
      </Alert>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-3">
        {(election?.candidates ?? []).map((candidate) => {
          const active = selectedOption === candidate.id;
          return (
            <button
              type="button"
              key={candidate.id}
              onClick={() => setSelectedOption(candidate.id)}
              className={cx(
                "flex min-h-20 items-center gap-4 rounded-lg border bg-white p-4 text-left transition",
                active
                  ? "border-blue-500 ring-4 ring-blue-100"
                  : "border-[var(--border)] hover:border-blue-300",
              )}
            >
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 text-slate-400",
                )}
              >
                <Radio size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold text-slate-950">
                  {candidate.name}
                </span>
                {candidate.description ? (
                  <span className="mt-1 block text-sm text-slate-500">
                    {candidate.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-4 rounded-lg border border-[var(--border)] bg-white p-4 shadow-lg shadow-slate-300/30">
        <Button
          onClick={submit}
          disabled={!selectedOption || submitting}
          className="w-full"
        >
          {submitting ? (
            "제출 중"
          ) : (
            <>
              <Vote size={18} aria-hidden="true" />
              투표하기
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
