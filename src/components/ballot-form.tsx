"use client";

import { Check, CircleSlash, Radio, ThumbsDown, ThumbsUp } from "lucide-react";
import type { BallotSelection } from "@/lib/ballot";
import type { BallotRules, Candidate } from "@/lib/types";
import { cx } from "@/lib/utils";

/**
 * 투표지 — 링크·이메일·조합원 세션 투표 화면이 공유한다.
 * 선택 상태는 부모가 들고(value/onChange), 유효성은 부모가 normalizeSelection 으로 판단한다.
 */
export function BallotForm({
  candidates,
  rules,
  value,
  onChange,
  disabled,
}: {
  candidates: Candidate[];
  rules: BallotRules;
  value: BallotSelection | null;
  onChange: (next: BallotSelection | null) => void;
  disabled?: boolean;
}) {
  const blank = Boolean(value && "blank" in value);
  const choices = value && "choices" in value ? value.choices : [];
  const approvals = value && "approvals" in value ? value.approvals : {};

  function toggleChoice(id: string) {
    if (rules.ballot_type === "single") {
      onChange({ choices: [id] });
      return;
    }
    if (choices.includes(id)) {
      const next = choices.filter((choice) => choice !== id);
      onChange(next.length > 0 ? { choices: next } : null);
      return;
    }
    if (choices.length >= rules.max_choices) {
      return;
    }
    onChange({ choices: [...choices, id] });
  }

  function setApproval(id: string, answer: "yes" | "no") {
    onChange({ approvals: { ...approvals, [id]: answer } });
  }

  function toggleBlank() {
    onChange(blank ? null : { blank: true });
  }

  const full = choices.length >= rules.max_choices;

  return (
    <div className="grid gap-3">
      {rules.ballot_type === "multi" || rules.ballot_type === "rank" ? (
        <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-2 text-sm">
          <span className="text-slate-600">
            {rules.ballot_type === "rank" ? "누른 순서대로 순위가 매겨집니다" : "선택한 항목"}
          </span>
          <span className="font-semibold text-slate-950">
            {choices.length} / {rules.max_choices}
          </span>
        </div>
      ) : null}

      {candidates.map((candidate) => {
        if (rules.ballot_type === "approve") {
          const answer = approvals[candidate.id];
          return (
            <div
              key={candidate.id}
              className={cx(
                "grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center",
                answer ? "border-blue-300" : "border-[var(--border)]",
                blank && "opacity-50",
              )}
            >
              <CandidateText candidate={candidate} />
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={answer === "yes"}
                  tone="yes"
                  disabled={disabled || blank}
                  onClick={() => setApproval(candidate.id, "yes")}
                >
                  <ThumbsUp size={17} aria-hidden="true" />
                  찬성
                </ChoiceButton>
                <ChoiceButton
                  active={answer === "no"}
                  tone="no"
                  disabled={disabled || blank}
                  onClick={() => setApproval(candidate.id, "no")}
                >
                  <ThumbsDown size={17} aria-hidden="true" />
                  반대
                </ChoiceButton>
              </div>
            </div>
          );
        }

        const index = choices.indexOf(candidate.id);
        const active = index >= 0;
        const locked = !active && full && rules.ballot_type !== "single";
        return (
          <button
            type="button"
            key={candidate.id}
            onClick={() => toggleChoice(candidate.id)}
            disabled={disabled || blank || locked}
            aria-pressed={active}
            className={cx(
              "flex min-h-20 items-center gap-4 rounded-lg border bg-white p-4 text-left transition disabled:cursor-not-allowed",
              active ? "border-blue-500 ring-4 ring-blue-100" : "border-[var(--border)] hover:border-blue-300",
              (blank || locked) && "opacity-50",
            )}
          >
            <span
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center border font-semibold",
                rules.ballot_type === "single" ? "rounded-full" : "rounded-lg",
                active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-400",
              )}
            >
              {rules.ballot_type === "rank" ? (
                active ? index + 1 : ""
              ) : rules.ballot_type === "multi" ? (
                active ? <Check size={18} aria-hidden="true" /> : null
              ) : (
                <Radio size={18} aria-hidden="true" />
              )}
            </span>
            <CandidateText candidate={candidate} />
          </button>
        );
      })}

      {rules.allow_blank ? (
        <button
          type="button"
          onClick={toggleBlank}
          disabled={disabled}
          aria-pressed={blank}
          className={cx(
            "flex min-h-14 items-center gap-3 rounded-lg border border-dashed bg-white px-4 text-left text-sm font-semibold transition",
            blank ? "border-slate-700 bg-slate-100 text-slate-950" : "border-slate-300 text-slate-500 hover:border-slate-500",
          )}
        >
          <CircleSlash size={18} aria-hidden="true" />
          기권 (아무 항목도 선택하지 않음)
        </button>
      ) : null}
    </div>
  );
}

function CandidateText({ candidate }: { candidate: Candidate }) {
  return (
    <span className="min-w-0">
      <span className="block text-lg font-semibold text-slate-950">{candidate.name}</span>
      {candidate.description ? (
        <span className="mt-1 block text-sm text-slate-500">{candidate.description}</span>
      ) : null}
    </span>
  );
}

function ChoiceButton({
  active,
  tone,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  tone: "yes" | "no";
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed",
        active && tone === "yes" && "border-blue-600 bg-blue-600 text-white",
        active && tone === "no" && "border-red-600 bg-red-600 text-white",
        !active && "border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}
