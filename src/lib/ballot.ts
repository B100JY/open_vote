import type { BallotRules, BallotType, Candidate } from "@/lib/types";

/**
 * 투표 방식과 선택 내용 정규화.
 *
 * DB 함수 `normalize_ballot_selection`(20261010000000 마이그레이션)과 같은 규칙이다.
 * 정규 문자열(canonical)은 영수증 해시 입력이자 공개 원장의 `selection` 값이라
 * 양쪽이 한 글자라도 다르면 유권자가 자기 표를 원장에서 확인할 수 없다.
 *
 * - single/multi: 고른 항목을 **후보 등록 순서**로 정렬해 "a,b"
 * - rank        : 고른 순서 그대로 "c>a>b"
 * - approve     : 후보 등록 순서로 "a:yes,b:no"
 * - 기권        : "BLANK"
 */

export const BALLOT_TYPES: Array<{ id: BallotType; label: string; description: string }> = [
  { id: "single", label: "하나 선택", description: "여러 항목 중 하나만 고릅니다. 찬반·안건·1인 선출에 씁니다." },
  { id: "multi", label: "여러 개 선택 (연기명)", description: "정원만큼 여러 명을 고릅니다. 대의원처럼 여러 명을 뽑을 때 씁니다." },
  { id: "approve", label: "항목별 찬성/반대", description: "후보마다 찬성·반대를 표시합니다. 단독 후보 신임이나 일괄 찬반에 씁니다." },
  { id: "rank", label: "순위 투표", description: "선호하는 순서대로 순위를 매깁니다. 1순위 득표와 순위 점수로 집계합니다." },
];

export const BLANK_SELECTION = "BLANK";

/** 후보 식별자 규칙 — 정규 문자열 구분자(, > :)와 겹치지 않게 */
export const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type BallotSelection =
  | { choices: string[] }
  | { approvals: Record<string, "yes" | "no"> }
  | { blank: true };

export type NormalizeResult =
  | { ok: true; canonical: string }
  | { ok: false; error: string; message: string };

export function ballotTypeLabel(type: BallotType | string | undefined) {
  return BALLOT_TYPES.find((item) => item.id === type)?.label ?? "하나 선택";
}

export function isBallotType(value: unknown): value is BallotType {
  return value === "single" || value === "multi" || value === "rank" || value === "approve";
}

/** 투표지 상단 안내 문구 */
export function describeBallotRules(rules: BallotRules, candidateCount: number) {
  const blank = rules.allow_blank ? " 기권도 할 수 있습니다." : "";
  switch (rules.ballot_type) {
    case "multi":
      return rules.min_choices === rules.max_choices
        ? `${rules.max_choices}개를 선택합니다.${blank}`
        : `${rules.min_choices}~${rules.max_choices}개를 선택합니다.${blank}`;
    case "rank":
      return rules.min_choices === rules.max_choices
        ? `선호하는 순서대로 ${rules.max_choices}순위까지 매깁니다.${blank}`
        : `선호하는 순서대로 ${rules.min_choices}~${rules.max_choices}순위를 매깁니다.${blank}`;
    case "approve":
      return `${candidateCount > 1 ? "각 항목마다 " : ""}찬성 또는 반대를 표시합니다.${blank}`;
    default:
      return `한 항목만 선택합니다.${blank}`;
  }
}

export function normalizeSelection(
  candidates: Candidate[],
  rules: BallotRules,
  selection: unknown,
): NormalizeResult {
  const ids = candidates.map((candidate) => candidate.id);

  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return fail("invalid_selection", "선택 내용이 올바르지 않습니다.");
  }
  const record = selection as Record<string, unknown>;

  if (record.blank === true) {
    if (!rules.allow_blank) {
      return fail("blank_not_allowed", "이 투표는 기권을 허용하지 않습니다.");
    }
    return { ok: true, canonical: BLANK_SELECTION };
  }

  if (rules.ballot_type === "approve") {
    const approvals = record.approvals;
    if (!approvals || typeof approvals !== "object" || Array.isArray(approvals)) {
      return fail("invalid_selection", "찬성/반대 표시가 올바르지 않습니다.");
    }
    const map = approvals as Record<string, unknown>;
    if (Object.keys(map).some((key) => !ids.includes(key))) {
      return fail("invalid_candidate", "선택할 수 없는 항목입니다.");
    }
    const parts: string[] = [];
    for (const id of ids) {
      const value = map[id];
      if (value !== "yes" && value !== "no") {
        return fail("incomplete_selection", "모든 항목에 찬성 또는 반대를 표시해주세요.");
      }
      parts.push(`${id}:${value}`);
    }
    return { ok: true, canonical: parts.join(",") };
  }

  const choices = record.choices;
  if (!Array.isArray(choices) || choices.some((choice) => typeof choice !== "string")) {
    return fail("invalid_selection", "선택 내용이 올바르지 않습니다.");
  }
  const picked = choices as string[];
  if (picked.length === 0) {
    return fail("empty_selection", "항목을 선택해주세요.");
  }
  if (new Set(picked).size !== picked.length) {
    return fail("duplicate_choice", "같은 항목을 두 번 선택할 수 없습니다.");
  }
  if (picked.some((choice) => !ids.includes(choice))) {
    return fail("invalid_candidate", "선택할 수 없는 항목입니다.");
  }

  if (rules.ballot_type === "single") {
    if (picked.length !== 1) {
      return fail("choice_count", "한 항목만 선택할 수 있습니다.");
    }
  } else if (picked.length < rules.min_choices || picked.length > rules.max_choices) {
    return fail(
      "choice_count",
      rules.min_choices === rules.max_choices
        ? `${rules.max_choices}개를 선택해주세요.`
        : `${rules.min_choices}~${rules.max_choices}개를 선택해주세요.`,
    );
  }

  if (rules.ballot_type === "rank") {
    return { ok: true, canonical: picked.join(">") };
  }

  return { ok: true, canonical: ids.filter((id) => picked.includes(id)).join(",") };
}

/** 정규 문자열을 사람이 읽는 문장으로 ("가, 나" / "1. 다 2. 가" / "가 찬성, 나 반대" / "기권") */
export function describeSelection(canonical: string, candidates: Candidate[]) {
  const name = (id: string) => candidates.find((candidate) => candidate.id === id)?.name ?? id;
  if (canonical === BLANK_SELECTION) {
    return "기권";
  }
  if (canonical.includes(">")) {
    return canonical
      .split(">")
      .map((id, index) => `${index + 1}. ${name(id)}`)
      .join("  ");
  }
  if (canonical.includes(":")) {
    return canonical
      .split(",")
      .map((part) => {
        const [id, value] = part.split(":");
        return `${name(id)} ${value === "yes" ? "찬성" : "반대"}`;
      })
      .join(", ");
  }
  return canonical
    .split(",")
    .map((id) => name(id))
    .join(", ");
}

/** 생성 화면 입력 검증 + 정리 (선택 개수 범위를 투표 방식에 맞게 고정) */
export function cleanBallotRules(
  input: { ballotType?: unknown; minChoices?: unknown; maxChoices?: unknown; allowBlank?: unknown },
  candidateCount: number,
): { ok: true; rules: BallotRules } | { ok: false; message: string } {
  const ballotType = input.ballotType === undefined ? "single" : input.ballotType;
  if (!isBallotType(ballotType)) {
    return { ok: false, message: "알 수 없는 투표 방식입니다." };
  }
  const allowBlank = input.allowBlank === true;

  if (ballotType === "single" || ballotType === "approve") {
    return { ok: true, rules: { ballot_type: ballotType, min_choices: 1, max_choices: 1, allow_blank: allowBlank } };
  }

  const max = Number(input.maxChoices);
  const min = input.minChoices === undefined ? max : Number(input.minChoices);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > candidateCount) {
    return {
      ok: false,
      message: `선택 개수는 1개 이상, 항목 수(${candidateCount}개) 이하로 정해주세요.`,
    };
  }
  return { ok: true, rules: { ballot_type: ballotType, min_choices: min, max_choices: max, allow_blank: allowBlank } };
}

function fail(error: string, message: string): NormalizeResult {
  return { ok: false, error, message };
}
