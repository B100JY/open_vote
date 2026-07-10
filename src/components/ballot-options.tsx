"use client";

import { Radio } from "lucide-react";
import type { Candidate } from "@/lib/types";
import { cx } from "@/lib/utils";

/** 투표 항목 선택 리스트 — 세션 기반/링크 기반 투표지가 공유합니다. */
export function BallotOptions({
  candidates,
  selected,
  onSelect,
}: {
  candidates: Candidate[];
  selected: string;
  onSelect: (candidateId: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {candidates.map((candidate) => {
        const active = selected === candidate.id;
        return (
          <button
            type="button"
            key={candidate.id}
            onClick={() => onSelect(candidate.id)}
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
  );
}
