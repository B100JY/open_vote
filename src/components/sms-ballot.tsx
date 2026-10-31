"use client";

import { PendingAuditRecovery } from "./pending-audit-recovery";
import Link from "next/link";
import { TrashVoteNotice } from "./trash-vote-notice";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BallotSheet, type BallotSheetElection } from "@/components/ballot-sheet";
import type { BallotSelection } from "@/lib/ballot";
import { Panel } from "@/components/ui";
import { VoteVerificationHint } from "@/components/vote-verification-hint";
import { formatDate } from "@/lib/utils";

export type SmsVoteStatus = {
  deletionPending?: boolean;
  purgeAfter?: string | null;
  deletionHeld?: boolean;
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

/**
 * 문자 투표 공통 화면(링크 /v/[token], 코드 /c). 상태를 불러와 안내하거나 기표지를 보여 준다.
 * load·submit 은 링크 토큰 또는 투표 코드로 서버를 부른다.
 */
export function SmsBallot({
  load,
  credential,
  submit,
  notice,
  invalidTitle = "투표 링크를 확인할 수 없습니다",
  expiredBody = "선거 관리자에게 링크 재발송을 요청해주세요.",
  againBody = "이 링크로는 다시 투표할 수 없습니다.",
}: {
  credential?: { body: Record<string, string>; headers?: Record<string, string> };
  load: () => Promise<SmsVoteStatus>;
  submit: (selection: BallotSelection, receiptHash: string) => Promise<{ receiptHash: string }>;
  notice: string;
  invalidTitle?: string;
  expiredBody?: string;
  againBody?: string;
}) {
  const [data, setData] = useState<SmsVoteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    load()
      .then((res) => setData(res))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "투표 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="p-6 text-center">
          <h1 className="text-xl font-semibold">투표 정보 확인 중</h1>
        </Panel>
      </div>
    );
  }

  if (!data) return <SmsNotice title={invalidTitle} body={error || "유효하지 않은 링크입니다."} />;
  if (data.deletionPending) return <TrashVoteNotice purgeAfter={data.purgeAfter} held={data.deletionHeld} credential={credential}/>;
  if (data.hasVoted) return (
    <div className="mx-auto grid max-w-xl gap-4">
      <SmsNotice title="이미 투표했습니다" body={againBody} />
      <PendingAuditRecovery electionId={data.election.id} />
      <Link className="text-center font-semibold text-blue-700 underline" href={`/elections/${data.election.id}`}>투표 내용·결과 보기</Link>
      <VoteVerificationHint electionId={data.election.id} closed={data.ended || data.election.status === "closed"} confirmed />
    </div>
  );
  if (data.expired && !data.ended && data.election.status !== "closed") return <SmsNotice title="투표 링크가 만료되었습니다" body={expiredBody} />;
  if (data.ended || data.election.status === "closed") {
    return <div className="mx-auto grid max-w-xl gap-4"><SmsNotice title="투표가 마감되었습니다" body="아래에서 투표 내용과 결과를 확인하세요." /><Link className="text-center font-semibold text-blue-700 underline" href={`/elections/${data.election.id}`}>투표 내용·결과 보기</Link></div>;
  }
  if (data.notStarted) {
    return (
      <SmsNotice
        title="아직 투표 시작 전입니다"
        body={`투표는 ${formatDate(data.election.starts_at)}에 시작합니다. 그때 다시 들어와 주세요.`}
      />
    );
  }
  if (data.election.status !== "active") {
    return <SmsNotice title="지금은 투표할 수 없습니다" body="선거가 준비 중이거나 일시 중단된 상태입니다." />;
  }

  return <BallotSheet credential={credential} election={data.election} notice={notice} submit={submit} />;
}

export function SmsNotice({ title, body }: { title: string; body: string }) {
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
