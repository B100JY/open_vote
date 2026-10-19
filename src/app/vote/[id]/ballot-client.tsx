"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BallotSheet } from "@/components/ballot-sheet";
import { Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election } from "@/lib/types";

type VoterStatus = {
  registered: boolean;
  hasVoted: boolean;
  voter?: { email: string };
};

export function BallotClient({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<Election | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [status, setStatus] = useState<VoterStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<{ election: Election }>(`/api/elections/${electionId}`)
      .then((data) => setElection(data.election))
      .catch(() => setElection(null));

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setChecking(false);
      setError("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      return;
    }
    const client = supabase;

    async function loadAuth() {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token ?? "";
      setAccessToken(token);

      if (!token) {
        setStatus(null);
        return;
      }

      const voterStatus = await fetchJson<VoterStatus>(
        `/api/auth/status?electionId=${electionId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setStatus(voterStatus);
    }

    loadAuth()
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "로그인 상태를 확인하지 못했습니다.");
      })
      .finally(() => setChecking(false));
  }, [electionId]);

  if (checking) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">로그인 상태 확인 중</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            유권자 명부와 참여 상태를 확인하고 있습니다.
          </p>
        </Panel>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">로그인이 필요합니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            이메일 매직 링크로 로그인한 뒤 투표할 수 있습니다.
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증하기
          </Link>
        </Panel>
      </div>
    );
  }

  if (status && (!status.registered || status.hasVoted)) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">
            {status.hasVoted ? "이미 투표했습니다" : "등록된 유권자가 아닙니다"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {status.hasVoted
              ? "참여 상태는 투표 완료로 기록되어 있습니다."
              : "현재 로그인한 이메일은 이 선거의 유권자 명부에 없습니다."}
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증 상태 보기
          </Link>
        </Panel>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">유권자 상태를 확인하지 못했습니다</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error || "잠시 후 다시 시도해주세요."}
          </p>
          <Link
            href={`/vote/${electionId}/auth`}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            인증 화면으로 이동
          </Link>
        </Panel>
      </div>
    );
  }

  if (!election) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">선거 정보를 불러오는 중입니다</h1>
        </Panel>
      </div>
    );
  }

  return (
    <BallotSheet
      election={election}
      notice="이메일 로그인으로 본인 확인되었습니다."
      submit={(selection, receiptHash) =>
        fetchJson<{ success: true; receiptHash: string }>("/api/vote", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ electionId, selection, receiptHash }),
        })
      }
    />
  );
}
