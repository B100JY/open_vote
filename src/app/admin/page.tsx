"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  ListChecks,
  Plus,
  Trash2,
  Vote,
} from "lucide-react";
import { Alert, Button, Field, Panel, Textarea } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import type { Candidate, Election, VoterRegistry } from "@/lib/types";
import { csvEscape } from "@/lib/utils";

type CreateResponse = {
  election: Election;
  voters: VoterRegistry[];
};

type OptionPreset = {
  id: string;
  label: string;
  description: string;
  items: string[];
};

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

export default function AdminPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [voterEmails, setVoterEmails] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("custom");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateResponse | null>(null);

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
      const response = await fetchJson<CreateResponse>("/api/elections", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          voterEmails: voterEmailList,
          candidates: candidates
            .map((candidate) => ({
              ...candidate,
              name: candidate.name.trim(),
            }))
            .filter((candidate) => candidate.name),
        }),
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
    setVoterEmails("");
    setCandidateName("");
    setCandidates([]);
    setSelectedPresetId("custom");
    setError("");
    setCreated(null);
  }

  function downloadCsv() {
    if (!created) {
      return;
    }

    const lines = [
      `선거명: ${csvEscape(created.election.name)}`,
      "이메일,투표여부,매직링크발송시각,투표시각",
      ...created.voters.map((voter) =>
        [
          csvEscape(voter.email),
          csvEscape(voter.has_voted ? "투표완료" : "투표전"),
          csvEscape(voter.invited_at),
          csvEscape(voter.voted_at),
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
          유권자 {created.voters.length}명이 등록되었습니다. 선거는 준비중 상태로
          생성되며, 선거 관리에서 진행중으로 전환한 뒤 매직 링크를 발송할 수 있습니다.
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
                CSV 파일에는 이메일과 참여 상태만 포함되며 투표 내용은 포함되지 않습니다.
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
                  <th className="px-4 py-3 font-medium">이메일</th>
                  <th className="px-4 py-3 font-medium">투표 여부</th>
                  <th className="px-4 py-3 font-medium">매직 링크</th>
                </tr>
              </thead>
              <tbody>
                {created.voters.map((voter) => (
                  <tr key={voter.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 text-slate-950">{voter.email}</td>
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
            선거 관리
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
              투표 항목과 유권자 이메일 명부를 등록하면 패스워드리스 투표가 준비됩니다.
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
            <Textarea
              label="유권자 이메일"
              value={voterEmails}
              onChange={(event) => setVoterEmails(event.target.value)}
              placeholder={"voter1@example.com\nvoter2@example.com"}
            />

            <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">항목 등록</span>
                    <span className="text-xs text-slate-500">
                      후보자, 찬반, 예/아니오, 안건 선택형을 모두 지원합니다.
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

            <Button onClick={submit} disabled={loading} className="w-full sm:w-fit">
              <CheckCircle2 size={18} aria-hidden="true" />
              {loading ? "생성 중" : "투표 생성 및 유권자 등록"}
            </Button>
          </div>
        </Panel>
      </section>

      <aside className="grid gap-4 self-start">
        <Panel className="p-5">
          <h2 className="text-lg font-semibold">생성 전 확인</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Row label="항목" value={`${candidates.length}개`} />
            <Row label="유권자" value={`${voterEmailList.length}명`} />
            <Row label="초기 상태" value="준비중" />
          </dl>
        </Panel>
        <Alert tone="info">
          동일한 화면으로 후보 선출, 찬반 의결, 복수 안건 선택형 투표를 모두 만들
          수 있습니다.
        </Alert>
        <Alert tone="info">
          유권자 명부와 투표용지는 데이터베이스에서 연결되지 않습니다. 실제 투표는
          서버 API가 참여 상태 갱신과 익명 투표지 저장을 원자적으로 처리합니다.
        </Alert>
      </aside>
    </div>
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
