import type { Candidate, Election, ElectionStatus } from "@/lib/types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function normalizeCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const record = candidate as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";

      if (!name) {
        return null;
      }

      const normalized: Candidate = {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id
            : `candidate_${index + 1}`,
        name,
      };
      if (typeof record.description === "string" && record.description.trim()) {
        normalized.description = record.description;
      }

      return normalized;
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

export function normalizeElection(value: unknown): Election {
  const record = value as Record<string, unknown>;

  return {
    id: String(record.id),
    name: String(record.name ?? ""),
    description:
      typeof record.description === "string" ? record.description : null,
    candidates: normalizeCandidates(record.candidates),
    total_voter_codes: Number(record.total_voter_codes ?? 0),
    status: normalizeStatus(record.status),
    starts_at: typeof record.starts_at === "string" ? record.starts_at : null,
    ends_at: typeof record.ends_at === "string" ? record.ends_at : null,
    created_at:
      typeof record.created_at === "string"
        ? record.created_at
        : new Date().toISOString(),
    updated_at:
      typeof record.updated_at === "string"
        ? record.updated_at
        : new Date().toISOString(),
  };
}

export function normalizeStatus(value: unknown): ElectionStatus {
  if (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "closed"
  ) {
    return value;
  }

  return "draft";
}

export function statusLabel(status: ElectionStatus | string | undefined) {
  switch (status) {
    case "draft":
      return "준비중";
    case "active":
      return "진행중";
    case "paused":
      return "일시중단";
    case "closed":
      return "종료";
    default:
      return "알수없음";
  }
}

export function statusTone(status: ElectionStatus | string | undefined) {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "paused":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "closed":
      return "bg-slate-200 text-slate-700 border-slate-300";
    case "draft":
    default:
      return "bg-blue-100 text-blue-800 border-blue-200";
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateShort(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

export function percentage(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${value.toFixed(1)}%`;
}

export function csvEscape(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
