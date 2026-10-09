"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BallotSheet, type BallotSheetElection } from "@/components/ballot-sheet";
import { Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { formatDate } from "@/lib/utils";

type LinkStatus = {
  election: BallotSheetElection & {
    status: string;
    starts_at: string | null;
    ends_at: string | null;
  };
  hasVoted: boolean;
  expired: boolean;
  ended: boolean;
  notStarted: boolean;
};

/** sms_token(문자 1회용 링크) 투표 화면. 세션 없이 토큰만으로 기표한다. */
export function LinkBallotClient({ token }: { token: string }) {
  const [data, setData] = useState<LinkStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<LinkStatus>(`/api/vote/link?token=${encodeURIComponent(token)}`)
      .then((res) => setData(res))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "투표 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">투표 정보 확인 중</h1>
        </Panel>
      </div>
    );
  }

  if (!data) {
    return (
      <Notice title="투표 링크를 확인할 수 없습니다" body={error || "유효하지 않은 링크입니다."} />
    );
  }

  if (data.hasVoted) {
    return <Notice title="이미 투표했습니다" body="이 링크로는 다시 투표할 수 없습니다." />;
  }
  if (data.expired) {
    return <Notice title="투표 링크가 만료되었습니다" body="선거 관리자에게 링크 재발송을 요청해주세요." />;
  }
  if (data.ended || data.election.status === "closed") {
    return <Notice title="투표가 마감되었습니다" body="결과는 투표 결과 화면에서 확인할 수 있습니다." />;
  }
  if (data.notStarted) {
    return (
      <Notice
        title="아직 투표 시작 전입니다"
        body={`투표는 ${formatDate(data.election.starts_at)}에 시작합니다. 그때 이 링크로 다시 들어와 주세요.`}
      />
    );
  }
  if (data.election.status !== "active") {
    return <Notice title="지금은 투표할 수 없습니다" body="선거가 준비 중이거나 일시 중단된 상태입니다." />;
  }

  return (
    <BallotSheet
      election={data.election}
      notice="문자로 받은 개별 링크로 본인 확인되었습니다."
      submit={(selection, receiptHash) =>
        fetchJson<{ success: true; receiptHash: string }>("/api/vote/link", {
          method: "POST",
          body: JSON.stringify({ token, selection, receiptHash }),
        })
      }
    />
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <Panel className="p-6 text-center">
        <AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
      </Panel>
    </div>
  );
}
