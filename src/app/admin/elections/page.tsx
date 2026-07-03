"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Badge, Button, EmptyState, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import type { Election, ElectionStatus, VoterRegistry } from "@/lib/types";
import {
  csvEscape,
  formatDate,
  statusLabel,
  statusTone,
} from "@/lib/utils";

type CodesResponse = {
  election: { id: string; name: string } | null;
  voters: VoterRegistry[];
};

export default function ManageElectionsPage() {
  return (
    <AdminGate>
      <ManageElections />
    </AdminGate>
  );
}

function ManageElections() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [invitingId, setInvitingId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ elections: Election[] }>("/api/elections", {
        headers: await authHeaders(),
      });
      setElections(data.elections);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "선거 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(election: Election, status: ElectionStatus) {
    setUpdatingId(election.id);
    setError("");
    try {
      await fetchJson<{ election: Election }>(`/api/elections/${election.id}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상태 변경에 실패했습니다.");
    } finally {
      setUpdatingId("");
    }
  }

  async function downloadParticipants(election: Election) {
    setError("");
    try {
      const data = await fetchJson<CodesResponse>(
        `/api/elections/${election.id}/participants`,
        { headers: await authHeaders() },
      );
      const lines = [
        `선거명: ${csvEscape(election.name)}`,
        "이메일,투표여부,매직링크발송시각,투표시각",
        ...data.voters.map((voter) =>
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
      anchor.download = `voter_registry_${election.name}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CSV 다운로드에 실패했습니다.");
    }
  }

  async function sendMagicLinks(election: Election) {
    setInvitingId(election.id);
    setError("");
    try {
      const result = await fetchJson<{ sent: number; failed: number }>(
        `/api/elections/${election.id}/participants/invite`,
        { method: "POST", headers: await authHeaders() },
      );
      await load();
      if (result.failed > 0) {
        setError(
          `매직 링크 ${result.sent}건 발송, ${result.failed}건 실패했습니다. Supabase Auth 이메일 설정을 확인해주세요.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "매직 링크 발송에 실패했습니다.");
    } finally {
      setInvitingId("");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            투표 생성
          </Link>
          <h1 className="text-2xl font-semibold text-slate-950">선거 관리</h1>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div className="grid gap-3">
          <Skeleton />
          <Skeleton />
        </div>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<Square size={28} aria-hidden="true" />}
          title="생성된 선거가 없습니다"
          description="새 투표를 생성하면 상태 관리와 CSV 다운로드가 가능합니다."
        />
      ) : (
        <div className="grid gap-3">
          {elections.map((election) => (
            <Panel key={election.id} className="p-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusTone(election.status)}>
                      {statusLabel(election.status)}
                    </Badge>
                    <span className="text-sm text-slate-500">
                      {formatDate(election.created_at)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">
                    {election.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                    {election.description || "설명이 등록되지 않았습니다."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                    <span>등록 유권자 {election.total_voter_codes}명</span>
                    <span>항목 {election.candidates.length}개</span>
                    <span>종료 {formatDate(election.ends_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => downloadParticipants(election)}
                  >
                    <Download size={17} aria-hidden="true" />
                    CSV
                  </Button>
                  {election.status === "active" ? (
                    <Button
                      variant="secondary"
                      onClick={() => sendMagicLinks(election)}
                      disabled={invitingId === election.id}
                    >
                      <Mail size={17} aria-hidden="true" />
                      링크 발송
                    </Button>
                  ) : null}
                  {election.status === "draft" ? (
                    <Button
                      onClick={() => updateStatus(election, "active")}
                      disabled={updatingId === election.id}
                    >
                      <Play size={17} aria-hidden="true" />
                      시작
                    </Button>
                  ) : null}
                  {election.status === "active" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => updateStatus(election, "paused")}
                        disabled={updatingId === election.id}
                      >
                        <Pause size={17} aria-hidden="true" />
                        일시중단
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => updateStatus(election, "closed")}
                        disabled={updatingId === election.id}
                      >
                        <CheckCircle2 size={17} aria-hidden="true" />
                        종료
                      </Button>
                    </>
                  ) : null}
                  {election.status === "paused" ? (
                    <>
                      <Button
                        onClick={() => updateStatus(election, "active")}
                        disabled={updatingId === election.id}
                      >
                        <Play size={17} aria-hidden="true" />
                        재개
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => updateStatus(election, "closed")}
                        disabled={updatingId === election.id}
                      >
                        <CheckCircle2 size={17} aria-hidden="true" />
                        종료
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <Panel className="p-5">
      <div className="h-7 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-6 w-2/5 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
    </Panel>
  );
}
