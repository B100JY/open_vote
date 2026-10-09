"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Vote } from "lucide-react";
import { BallotForm } from "@/components/ballot-form";
import { Alert, Button } from "@/components/ui";
import {
  describeBallotRules,
  describeSelection,
  normalizeSelection,
  type BallotSelection,
} from "@/lib/ballot";
import type { BallotRules, Candidate } from "@/lib/types";
import { createVoteReceipt } from "@/lib/verification";

export type BallotSheetElection = BallotRules & {
  id: string;
  name: string;
  description: string | null;
  candidates: Candidate[];
};

/** 투표 완료 화면이 읽는 영수증. 탭을 닫으면 사라지도록 sessionStorage 에 둔다. */
export const RECEIPT_STORAGE_KEY = "open_vote_last_receipt";

export type SavedReceipt = {
  electionId: string;
  electionName: string;
  salt: string;
  receiptHash: string;
};

/**
 * 투표지 + 제출. 제출 방식(링크 토큰 / 로그인 세션)만 호출하는 쪽이 정한다.
 * 선택 내용은 기기에 남기지 않는다(공용 기기에서 다음 사람이 보지 못하게).
 */
export function BallotSheet({
  election,
  notice,
  submit,
}: {
  election: BallotSheetElection;
  notice: string;
  submit: (selection: BallotSelection, receiptHash: string) => Promise<{ receiptHash: string }>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<BallotSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const normalized = useMemo(
    () => (selection ? normalizeSelection(election.candidates, election, selection) : null),
    [election, selection],
  );

  async function handleSubmit() {
    if (!selection || !normalized?.ok) {
      return;
    }
    const confirmed = window.confirm(
      `${describeSelection(normalized.canonical, election.candidates)}\n\n이대로 제출하시겠습니까? 제출한 투표는 취소할 수 없습니다.`,
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const receipt = await createVoteReceipt({ electionId: election.id, selection: normalized.canonical });
      const response = await submit(selection, receipt.receiptHash);
      const saved: SavedReceipt = {
        electionId: election.id,
        electionName: election.name,
        salt: receipt.salt,
        receiptHash: response.receiptHash,
      };
      try {
        sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(saved));
      } catch {
        // 저장이 막힌 브라우저에서도 투표 자체는 끝났다
      }
      router.replace("/vote/complete");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "투표 제출에 실패했습니다.");
      setSubmitting(false);
    }
  }

  const hint =
    selection && normalized && !normalized.ok && normalized.error !== "empty_selection"
      ? normalized.message
      : "";

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">{election.name}</h1>
        {election.description ? (
          <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{election.description}</p>
        ) : null}
      </div>

      <Alert tone="info">
        <span className="inline-flex items-start gap-2">
          <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {notice} {describeBallotRules(election, election.candidates.length)}
          </span>
        </span>
      </Alert>

      {error ? <Alert>{error}</Alert> : null}

      <BallotForm
        candidates={election.candidates}
        rules={election}
        value={selection}
        onChange={setSelection}
        disabled={submitting}
      />

      <div className="sticky bottom-4 grid gap-2 rounded-lg border border-[var(--border)] bg-white p-4 shadow-lg shadow-slate-300/30">
        {hint ? <p className="text-sm text-amber-700">{hint}</p> : null}
        <Button onClick={handleSubmit} disabled={!normalized?.ok || submitting} className="w-full">
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
