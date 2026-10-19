"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Coins,
  Download,
  ListChecks,
  MessageSquareText,
  Plus,
  Trash2,
  Vote,
} from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Button, Field, Panel, Textarea } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import { BALLOT_TYPES, cleanBallotRules, describeBallotRules } from "@/lib/ballot";
import type { BallotType, Candidate, CreditsSummary, Election, VoterRegistry } from "@/lib/types";
import { csvEscape, formatDate } from "@/lib/utils";
import { formatPhone, normalizePhone } from "@/lib/voters";

type CreateResponse = {
  election: Election;
  voters: VoterRegistry[];
  billing: { unitPrice: number; voterCount: number; cost: number; balance: number };
};

type OptionPreset = {
  id: string;
  label: string;
  description: string;
  items: string[];
};

type VoterMode = "sms" | "email";

/** datetime-local 입력값(로컬 시각, 분 단위) */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 기본 기간: 지금부터 사흘 뒤 18시까지 */
function defaultPeriod() {
  const start = new Date();
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
  end.setHours(18, 0, 0, 0);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

const optionPresets: OptionPreset[] = [
  {
    id: "custom",
    label: "후보자/직접 입력",
    description: "이름이나 안건명을 자유롭게 추가합니다.",
    items: [],
  },
  {
    id: "yes-no",
    label: "예 / 아니오",
    description: "단순 찬반 또는 승인 여부 투표에 적합합니다.",
    items: ["예", "아니오"],
  },
  {
    id: "agree-disagree-hold",
    label: "찬성 / 반대 / 보류",
    description: "노조 안건이나 의사결정 투표에 바로 사용할 수 있습니다.",
    items: ["찬성", "반대", "보류"],
  },
  {
    id: "abc",
    label: "A안 / B안 / C안",
    description: "여러 안 가운데 하나를 선택하는 투표에 적합합니다.",
    items: ["A안", "B안", "C안"],
  },
];

function createOption(name: string): Candidate {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `candidate_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name,
  };
}

/** "010-1234-5678,홍길동" 또는 "010-1234-5678 홍길동" 형식의 줄을 파싱 */
function parsePhoneLines(text: string): {
  voters: Array<{ phone: string; name?: string }>;
  invalid: string[];
} {
  const voters: Array<{ phone: string; name?: string }> = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const [first, ...rest] = line.split(/[,\t]/);
    let phoneSource = first?.trim() ?? "";
    let name = rest.join(" ").trim();

    // 콤마 없이 "번호 이름" 형태도 허용
    if (!name && /\s/.test(phoneSource)) {
      const parts = phoneSource.split(/\s+/);
      phoneSource = parts[0] ?? "";
      name = parts.slice(1).join(" ");
    }

    const phone = normalizePhone(phoneSource);
    if (!phone) {
      invalid.push(line);
      continue;
    }
    if (seen.has(phone)) {
      continue;
    }
    seen.add(phone);
    voters.push(name ? { phone, name } : { phone });
  }

  return { voters, invalid };
}

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminCreateForm />
    </AdminGate>
  );
}

function AdminCreateForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [voterMode, setVoterMode] = useState<VoterMode>("sms");
  const [voterPhones, setVoterPhones] = useState("");
  const [voterEmails, setVoterEmails] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("custom");
  const [ballotType, setBallotType] = useState<BallotType>("single");
  const [minChoices, setMinChoices] = useState(1);
  const [maxChoices, setMaxChoices] = useState(1);
  const [allowBlank, setAllowBlank] = useState(false);
  const [period, setPeriod] = useState(defaultPeriod);
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<CreditsSummary>("/api/credits", {
          headers: await authHeaders(),
        });
        if (!cancelled) {
          setCredits(data);
        }
      } catch {
        // 잔액 표시는 부가 정보이므로 실패해도 폼은 사용 가능
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [created]);

  const phoneParse = useMemo(() => parsePhoneLines(voterPhones), [voterPhones]);

  const voterEmailList = useMemo(
    () =>
      Array.from(
        new Set(
          voterEmails
            .split(/[\n,;]/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    [voterEmails],
  );

  const voterCount =
    voterMode === "sms" ? phoneParse.voters.length : voterEmailList.length;
  const unitPrice = credits?.unitPrice ?? 10;
  const estimatedCost = voterCount * unitPrice;
  const insufficient = credits !== null && estimatedCost > credits.balance;

  const filledCandidates = candidates.filter((candidate) => candidate.name.trim()).length;
  const rulesCheck = cleanBallotRules(
    { ballotType, minChoices, maxChoices, allowBlank },
    Math.max(filledCandidates, 1),
  );

  const votedCount = useMemo(
    () => created?.voters.filter((voter) => voter.has_voted).length ?? 0,
    [created],
  );

  function addCandidate() {
    const trimmed = candidateName.trim();
    if (!trimmed) {
      return;
    }

    setCandidates((current) => [...current, createOption(trimmed)]);
    setCandidateName("");
    setSelectedPresetId("custom");
  }

  function removeCandidate(id: string) {
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
  }

  function updateCandidateName(id: string, name: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, name } : candidate,
      ),
    );
  }

  function applyPreset(preset: OptionPreset) {
    setSelectedPresetId(preset.id);
    setCandidateName("");

    if (preset.items.length === 0) {
      setCandidates([]);
      return;
    }

    setCandidates(preset.items.map((item) => createOption(item)));
  }

  async function submit() {
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        name,
        description,
        ballotType,
        minChoices,
        maxChoices,
        allowBlank,
        startsAt: period.start ? new Date(period.start).toISOString() : undefined,
        endsAt: period.end ? new Date(period.end).toISOString() : undefined,
        candidates: candidates
          .map((candidate) => ({
            ...candidate,
            name: candidate.name.trim(),
          }))
          .filter((candidate) => candidate.name),
      };

      if (!rulesCheck.ok) {
        throw new Error(rulesCheck.message);
      }
      // 마감이 지난 시각인지는 서버(create_billed_election)가 확인한다
      if (!period.end) {
        throw new Error("투표 마감 일시를 입력해주세요.");
      }

      if (voterMode === "sms") {
        if (phoneParse.invalid.length > 0) {
          throw new Error(
            `잘못된 전화번호 형식이 있습니다: ${phoneParse.invalid.slice(0, 3).join(" / ")}${phoneParse.invalid.length > 3 ? " 외" : ""}`,
          );
        }
        payload.voters = phoneParse.voters;
      } else {
        payload.voterEmails = voterEmailList;
      }

      const response = await fetchJson<CreateResponse>("/api/elections", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload),
      });

      setCreated(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "투표 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setName("");
    setDescription("");
    setVoterPhones("");
    setVoterEmails("");
    setCandidateName("");
    setCandidates([]);
    setSelectedPresetId("custom");
    setBallotType("single");
    setMinChoices(1);
    setMaxChoices(1);
    setAllowBlank(false);
    setPeriod(defaultPeriod());
    setError("");
    setCreated(null);
  }

  function downloadCsv() {
    if (!created) {
      return;
    }

    const lines = [
      `선거명: ${csvEscape(created.election.name)}`,
      "연락처,이름,투표여부,링크발송시각",
      ...created.voters.map((voter) =>
        [
          csvEscape(voter.phone ? formatPhone(voter.phone) : (voter.email ?? "")),
          csvEscape(voter.voter_name ?? ""),
          csvEscape(voter.has_voted ? "투표완료" : "투표전"),
          csvEscape(voter.invited_at),
        ].join(","),
      ),
    ];

    const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `voter_registry_${created.election.name}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (created) {
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">투표 생성 완료</h1>
            <p className="mt-1 text-sm text-slate-500">{created.election.name}</p>
          </div>
          <Button variant="secondary" onClick={reset}>
            <Plus size={18} aria-hidden="true" />
            새 투표
          </Button>
        </div>

        <Alert tone="success">
          유권자 {created.voters.length}명이 등록되었고 포인트{" "}
          {created.billing.cost.toLocaleString()}P가 차감되었습니다 (잔액{" "}
          {created.billing.balance.toLocaleString()}P). 선거는 준비중 상태로
          생성되며, 선거 관리에서 진행중으로 전환한 뒤 투표 링크 문자를 발송할 수
          있습니다.
        </Alert>

        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="전체" value={created.voters.length} />
          <Stat label="투표 전" value={created.voters.length - votedCount} />
          <Stat label="투표 완료" value={votedCount} />
        </div>

        <Panel className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">유권자 명부 파일</h2>
              <p className="mt-1 text-sm text-slate-500">
                CSV 파일에는 연락처와 참여 상태만 포함되며 투표 내용은 포함되지 않습니다.
              </p>
            </div>
            <Button onClick={downloadCsv}>
              <Download size={18} aria-hidden="true" />
              CSV 다운로드
            </Button>
          </div>

          <div className="mt-5 max-h-72 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">연락처</th>
                  <th className="px-4 py-3 font-medium">이름</th>
                  <th className="px-4 py-3 font-medium">투표 여부</th>
                  <th className="px-4 py-3 font-medium">링크 발송</th>
                </tr>
              </thead>
              <tbody>
                {created.voters.map((voter) => (
                  <tr key={voter.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 text-slate-950">
                      {voter.phone ? formatPhone(voter.phone) : voter.email}
                    </td>
                    <td className="px-4 py-3">{voter.voter_name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {voter.has_voted ? "투표완료" : "투표전"}
                    </td>
                    <td className="px-4 py-3">{voter.invited_at ? "발송됨" : "미발송"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/elections"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <ListChecks size={18} aria-hidden="true" />
            선거 관리 (문자 발송)
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Vote size={18} aria-hidden="true" />
            진행률 보기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">새 투표 생성</h1>
            <p className="mt-1 text-sm text-slate-500">
              투표 항목과 유권자 명부를 등록하면 문자(SMS)로 1인 1투표 링크를
              발송할 수 있습니다.
            </p>
          </div>
          <Link
            href="/admin/elections"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <ListChecks size={17} aria-hidden="true" />
            선거 관리
          </Link>
        </div>

        <Panel className="p-5">
          <div className="grid gap-4">
            <Field
              label="투표명"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 2026년 정기 임원 선거"
            />
            <Textarea
              label="투표 설명"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="투표에 대한 간단한 설명"
            />

            <div className="grid gap-2">
              <span className="text-sm font-medium text-slate-700">유권자 명부</span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className={
                    voterMode === "sms"
                      ? "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                      : ""
                  }
                  onClick={() => setVoterMode("sms")}
                >
                  <MessageSquareText size={17} aria-hidden="true" />
                  휴대폰 번호 (문자 발송)
                </Button>
                <Button
                  variant="secondary"
                  className={
                    voterMode === "email"
                      ? "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100"
                      : ""
                  }
                  onClick={() => setVoterMode("email")}
                >
                  이메일 (매직 링크)
                </Button>
              </div>

              {voterMode === "sms" ? (
                <>
                  <Textarea
                    label="휴대폰 번호 목록 (한 줄에 한 명, 번호 뒤에 쉼표로 이름 추가 가능)"
                    value={voterPhones}
                    onChange={(event) => setVoterPhones(event.target.value)}
                    placeholder={"010-1234-5678,홍길동\n010-9876-5432"}
                  />
                  {phoneParse.invalid.length > 0 ? (
                    <Alert tone="warning">
                      잘못된 형식 {phoneParse.invalid.length}건:{" "}
                      {phoneParse.invalid.slice(0, 3).join(" / ")}
                      {phoneParse.invalid.length > 3 ? " 외" : ""}
                    </Alert>
                  ) : null}
                </>
              ) : (
                <Textarea
                  label="유권자 이메일 (줄바꿈/쉼표 구분)"
                  value={voterEmails}
                  onChange={(event) => setVoterEmails(event.target.value)}
                  placeholder={"voter1@example.com\nvoter2@example.com"}
                />
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">투표 시작</span>
                <input
                  type="datetime-local"
                  className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={period.start}
                  onChange={(event) => setPeriod((current) => ({ ...current, start: event.target.value }))}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">투표 마감</span>
                <input
                  type="datetime-local"
                  className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={period.end}
                  onChange={(event) => setPeriod((current) => ({ ...current, end: event.target.value }))}
                />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2">
                시작 전에는 링크를 열어도 투표할 수 없고, 마감 시각이 지나면 선거가 자동으로 종료되어 결과가 공개됩니다.
              </p>
            </div>

            <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-slate-50 p-4">
              <span className="text-sm font-medium text-slate-700">투표 방식</span>
              <div className="grid gap-2 md:grid-cols-2">
                {BALLOT_TYPES.map((type) => (
                  <Button
                    key={type.id}
                    variant="secondary"
                    className={
                      ballotType === type.id
                        ? "h-auto justify-start border-blue-300 bg-blue-50 px-4 py-3 text-left text-blue-900 hover:bg-blue-100"
                        : "h-auto justify-start px-4 py-3 text-left"
                    }
                    onClick={() => {
                      setBallotType(type.id);
                      if (type.id === "multi" || type.id === "rank") {
                        const fallback = Math.max(Math.min(filledCandidates, 2), 1);
                        setMaxChoices((current) => (current > 1 ? current : fallback));
                        setMinChoices(1);
                      }
                    }}
                  >
                    <span className="grid gap-1">
                      <span>{type.label}</span>
                      <span
                        className={
                          ballotType === type.id
                            ? "text-xs font-medium text-blue-700"
                            : "text-xs font-medium text-slate-500"
                        }
                      >
                        {type.description}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>

              {ballotType === "multi" || ballotType === "rank" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <NumberField
                    label={ballotType === "rank" ? "최소 순위 수" : "최소 선택 수"}
                    value={minChoices}
                    onChange={setMinChoices}
                  />
                  <NumberField
                    label={ballotType === "rank" ? "최대 순위 수" : "최대 선택 수 (정원)"}
                    value={maxChoices}
                    onChange={setMaxChoices}
                  />
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={allowBlank}
                  onChange={(event) => setAllowBlank(event.target.checked)}
                />
                기권(백지) 투표 허용
              </label>

              {rulesCheck.ok ? (
                <p className="text-xs text-slate-500">
                  유권자 안내: {describeBallotRules(rulesCheck.rules, filledCandidates)}
                </p>
              ) : (
                <Alert tone="warning">{rulesCheck.message}</Alert>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">항목 등록</span>
                    <span className="text-xs text-slate-500">
                      후보자 이름이나 안건 선택지를 등록합니다.
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {optionPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        variant="secondary"
                        className={
                          selectedPresetId === preset.id
                            ? "h-auto justify-start border-blue-300 bg-blue-50 px-4 py-3 text-left text-blue-900 hover:bg-blue-100"
                            : "h-auto justify-start px-4 py-3 text-left"
                        }
                        onClick={() => applyPreset(preset)}
                      >
                        <span className="grid gap-1">
                          <span>{preset.label}</span>
                          <span
                            className={
                              selectedPresetId === preset.id
                                ? "text-xs font-medium text-blue-700"
                                : "text-xs font-medium text-slate-500"
                            }
                          >
                            {preset.description}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-white px-3 py-2 text-xs text-slate-500">
                    프리셋을 누르면 현재 항목 목록이 해당 형식으로 교체됩니다.
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">
                    직접 항목 추가
                  </span>
                  <span className="flex gap-2">
                    <input
                      className="h-11 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      value={candidateName}
                      onChange={(event) => setCandidateName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCandidate();
                        }
                      }}
                      placeholder="항목 이름 또는 선택지"
                    />
                    <Button onClick={addCandidate}>
                      <Plus size={18} aria-hidden="true" />
                      추가
                    </Button>
                  </span>
                </label>

                {candidates.length > 0 ? (
                  <ul className="grid gap-2">
                    {candidates.map((candidate, index) => (
                      <li
                        key={candidate.id}
                        className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">
                          {index + 1}
                        </span>
                        <input
                          className="h-10 flex-1 rounded-lg border border-transparent bg-transparent px-2 outline-none transition focus:border-blue-500 focus:bg-blue-50"
                          value={candidate.name}
                          onChange={(event) =>
                            updateCandidateName(candidate.id, event.target.value)
                          }
                          placeholder="항목 이름"
                        />
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                          onClick={() => removeCandidate(candidate.id)}
                          aria-label={`${candidate.name || `항목 ${index + 1}`} 삭제`}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-white px-4 py-5 text-sm text-slate-500">
                    아직 등록된 항목이 없습니다. 프리셋을 불러오거나 직접 추가해 주세요.
                  </div>
                )}
              </div>
            </div>

            {error ? <Alert>{error}</Alert> : null}
            {insufficient ? (
              <Alert tone="warning">
                포인트 잔액이 부족합니다. 필요 {estimatedCost.toLocaleString()}P,
                보유 {credits?.balance.toLocaleString()}P —{" "}
                <Link href="/admin/credits" className="font-semibold underline">
                  포인트 충전 안내
                </Link>
              </Alert>
            ) : null}

            <Button
              onClick={submit}
              disabled={loading || insufficient}
              className="w-full sm:w-fit"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {loading
                ? "생성 중"
                : `투표 생성 (${estimatedCost.toLocaleString()}P 차감)`}
            </Button>
          </div>
        </Panel>
      </section>

      <aside className="grid gap-4 self-start">
        <Panel className="p-5">
          <h2 className="text-lg font-semibold">생성 전 확인</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Row
              label="투표 방식"
              value={BALLOT_TYPES.find((type) => type.id === ballotType)?.label ?? ""}
            />
            <Row label="항목" value={`${candidates.length}개`} />
            <Row label="유권자" value={`${voterCount}명`} />
            <Row
              label={`예상 비용 (1인 ${unitPrice}P)`}
              value={`${estimatedCost.toLocaleString()}P`}
            />
            <Row
              label="포인트 잔액"
              value={credits ? `${credits.balance.toLocaleString()}P` : "확인 중"}
            />
            <Row
              label="마감"
              value={period.end ? formatDate(new Date(period.end).toISOString()) : "-"}
            />
            <Row label="초기 상태" value="준비중" />
          </dl>
          <Link
            href="/admin/credits"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <Coins size={17} aria-hidden="true" />
            포인트 관리
          </Link>
          <Link
            href="/admin/members"
            className="ml-2 mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            회원 승인 (관리자)
          </Link>
        </Panel>
        <Alert tone="info">
          투표 생성 시 유권자 1인당 {unitPrice}P가 선불 포인트에서 차감됩니다.
          문자 발송은 생성 후 선거를 진행중으로 전환한 뒤 시작할 수 있습니다.
        </Alert>
        <Alert tone="info">
          명부에는 투표 여부만 남고 투표 시각은 기록하지 않습니다. 투표지는 명부와
          연결되지 않으며, 결과와 공개 원장은 투표가 종료된 뒤에만 열립니다.
        </Alert>
      </aside>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="number"
        min={1}
        className="h-11 rounded-lg border border-[var(--border)] bg-white px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        value={value}
        onChange={(event) => onChange(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="p-5">
      <div className="text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
