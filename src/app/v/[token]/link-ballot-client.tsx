"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Radio, Vote } from "lucide-react";
import { Alert, Button, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Candidate } from "@/lib/types";
import { cx } from "@/lib/utils";
import { createVoteReceipt } from "@/lib/verification";

type LinkStatus = {
  election: {
    id: string;
    name: string;
    description: string | null;
    candidates: Candidate[];
    status: string;
  };
  hasVoted: boolean;
  expired: boolean;
  ended: boolean;
};

/** sms_token(문자 1회용 링크) 투표 화면. 세션 없이 토큰만으로 기표한다. */
export function LinkBallotClient({ token }: { token: string }) {
  const router = useRouter();
  const [data, setData] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<LinkStatus>(`/api/vote/link?token=${encodeURIComponent(token)}`)
      .then((res) => setData(res))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "투표 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedName = useMemo(
    () => data?.election.candidates.find((candidate) => candidate.id === selectedOption)?.name,
    [data, selectedOption],
  );

  async function submit() {
    if (!data || !selectedOption) return;
    const confirmed = window.confirm(
      `"${selectedName ?? "선택한 항목"}"으로 제출하시겠습니까?\n제출한 투표는 취소할 수 없습니다.`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError("");
    try {
      const receipt = await createVoteReceipt({
        electionId: data.election.id,
        selectedCandidate: selectedOption,
      });
      const response = await fetchJson<{
        success: true;
        receiptHash: string;
        sequenceNumber: number | null;
        chainHash: string | null;
      }>("/api/vote/link", {
        method: "POST",
        body: JSON.stringify({ token, selectedCandidate: selectedOption, receiptHash: receipt.receiptHash }),
      });

      localStorage.setItem(
        "open_vote_last_receipt",
        JSON.stringify({
          electionId: data.election.id,
          electionName: data.election.name,
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

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">투표 정보 확인 중</h1>
        </Panel>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">투표 링크를 확인할 수 없습니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error || "유효하지 않은 링크입니다."}</p>
        </Panel>
      </div>
    );
  }

  if (data.hasVoted || data.expired || data.ended || data.election.status !== "active") {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">
            {data.hasVoted
              ? "이미 투표했습니다"
              : data.expired
                ? "투표 링크가 만료되었습니다"
                : data.ended
                  ? "투표가 마감되었습니다"
                  : "투표 기간이 아닙니다"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {data.hasVoted
              ? "이 링크로는 다시 투표할 수 없습니다."
              : "문자로 받은 링크의 유효기간이 지났거나 투표가 종료되었습니다."}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">{data.election.name}</h1>
        {data.election.description ? (
          <p className="mt-1 text-sm text-slate-500">{data.election.description}</p>
        ) : null}
      </div>

      <Alert tone="info">
        <span className="inline-flex items-center gap-2">
          <Info size={17} aria-hidden="true" />
          문자로 받은 개별 링크로 본인 확인되었습니다. 한 항목만 선택할 수 있습니다.
        </span>
      </Alert>

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-3">
        {data.election.candidates.map((candidate) => {
          const active = selectedOption === candidate.id;
          return (
            <button
              type="button"
              key={candidate.id}
              onClick={() => setSelectedOption(candidate.id)}
              className={cx(
                "flex min-h-20 items-center gap-4 rounded-lg border bg-white p-4 text-left transition",
                active ? "border-blue-500 ring-4 ring-blue-100" : "border-[var(--border)] hover:border-blue-300",
              )}
            >
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-400",
                )}
              >
                <Radio size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold text-slate-950">{candidate.name}</span>
                {candidate.description ? (
                  <span className="mt-1 block text-sm text-slate-500">{candidate.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-4 rounded-lg border border-[var(--border)] bg-white p-4 shadow-lg shadow-slate-300/30">
        <Button onClick={submit} disabled={!selectedOption || submitting} className="w-full">
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
