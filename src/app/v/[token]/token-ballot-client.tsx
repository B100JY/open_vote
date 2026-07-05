"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Vote } from "lucide-react";
import { BallotOptions } from "@/components/ballot-options";
import { Alert, Button } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Election } from "@/lib/types";
import { createVoteReceipt } from "@/lib/verification";

/**
 * SMS로 받은 투표 링크(/v/<token>) 전용 투표지.
 * 로그인 없이 링크 토큰으로 유권자를 식별하며, 서버가 토큰 해시로 검증합니다.
 */
export function TokenBallotClient({
  election,
  token,
  voterName,
}: {
  election: Election;
  token: string;
  voterName: string | null;
}) {
  const router = useRouter();
  const [selectedOption, setSelectedOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedName = useMemo(
    () => election.candidates.find((candidate) => candidate.id === selectedOption)?.name,
    [election, selectedOption],
  );

  async function submit() {
    if (!selectedOption || submitting) {
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
        electionId: election.id,
        selectedCandidate: selectedOption,
      });
      const response = await fetchJson<{
        success: true;
        receiptHash: string;
        sequenceNumber: number | null;
        chainHash: string | null;
      }>("/api/vote", {
        method: "POST",
        body: JSON.stringify({
          electionId: election.id,
          selectedCandidate: selectedOption,
          receiptHash: receipt.receiptHash,
          voterToken: token,
        }),
      });

      localStorage.setItem(
        "open_vote_last_receipt",
        JSON.stringify({
          electionId: election.id,
          electionName: election.name,
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

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">투표 항목 선택</h1>
        <p className="mt-1 text-sm text-slate-500">
          {voterName ? `${voterName}님, ` : ""}
          {election.name}
        </p>
      </div>

      <Alert tone="info">
        <span className="inline-flex items-center gap-2">
          <Info size={17} aria-hidden="true" />
          한 항목만 선택할 수 있습니다. 이 링크는 본인 1회 투표 전용입니다.
        </span>
      </Alert>

      {error ? <Alert>{error}</Alert> : null}

      <BallotOptions
        candidates={election.candidates}
        selected={selectedOption}
        onSelect={setSelectedOption}
      />

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
