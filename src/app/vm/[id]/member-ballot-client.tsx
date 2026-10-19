"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BallotSheet } from "@/components/ballot-sheet";
import { Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election } from "@/lib/types";

type VoterStatus = {
  election: { id: string; name: string; status: string; auth_mode: string };
  registered: boolean;
  hasVoted: boolean;
};

/**
 * member_session(조합원 세션) 투표 화면.
 * 노조링크 핸드오프로 로그인된 상태여야 하며, 미로그인 시 노조링크로 돌아가도록 안내한다.
 */
export function MemberBallotClient({ electionId }: { electionId: string }) {
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
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setStatus(voterStatus);
    }

    loadAuth()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "로그인 상태를 확인하지 못했습니다."))
      .finally(() => setChecking(false));
  }, [electionId]);

  if (checking) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">로그인 상태 확인 중</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">조합원 명부와 참여 상태를 확인하고 있습니다.</p>
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
            노조링크 조합원 페이지에서 &ldquo;투표하기&rdquo; 링크를 통해 다시 접속해주세요. 본인 확인 후 자동으로 투표 화면이 열립니다.
          </p>
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
            {status.hasVoted ? "이미 투표했습니다" : "투표 대상이 아닙니다"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {status.hasVoted
              ? "참여 상태는 투표 완료로 기록되어 있습니다."
              : "현재 계정은 이 선거의 조합원 명부에 없습니다."}
          </p>
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
          <p className="mt-2 text-sm leading-6 text-slate-500">{error || "잠시 후 다시 시도해주세요."}</p>
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
      notice="노조링크 조합원 인증으로 본인 확인되었습니다."
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
