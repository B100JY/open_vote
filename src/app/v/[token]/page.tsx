import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, Clock } from "lucide-react";
import { Panel } from "@/components/ui";
import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeElection, statusLabel } from "@/lib/utils";
import { hashVoterToken, isValidVoterTokenFormat } from "@/lib/voter-token";
import { TokenBallotClient } from "./token-ballot-client";

export const dynamic = "force-dynamic";

/**
 * SMS로 발송된 투표 링크 진입점.
 * 토큰 해시로 유권자를 조회해 선거 상태에 맞는 화면을 렌더링합니다.
 * (재발송 시 토큰이 회전되므로 예전 문자의 링크는 무효가 됩니다)
 */
export default async function VoteLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isValidVoterTokenFormat(token)) {
    return (
      <Notice
        icon={<AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />}
        title="유효하지 않은 투표 링크입니다"
        description="링크가 잘렸거나 잘못 입력되었습니다. 문자로 받은 링크 전체를 다시 열어주세요."
      />
    );
  }

  const supabase = getServiceSupabase();
  const { data: voter } = await supabase
    .from("voter_registry")
    .select("id, election_id, has_voted, voted_at, voter_name")
    .eq("access_token_hash", hashVoterToken(token))
    .maybeSingle();

  if (!voter) {
    return (
      <Notice
        icon={<AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />}
        title="유효하지 않은 투표 링크입니다"
        description="링크가 만료되었거나(재발송 시 이전 링크는 무효화됩니다) 잘못된 링크입니다. 가장 최근에 받은 문자의 링크를 이용해주세요."
      />
    );
  }

  const { data: electionRow } = await supabase
    .from("elections")
    .select("*")
    .eq("id", voter.election_id)
    .maybeSingle();

  if (!electionRow) {
    return (
      <Notice
        icon={<AlertTriangle className="mx-auto text-amber-600" size={42} aria-hidden="true" />}
        title="선거 정보를 찾을 수 없습니다"
        description="선거가 삭제되었거나 일시적인 오류입니다. 주최자에게 문의해주세요."
      />
    );
  }

  const election = normalizeElection(electionRow);

  if (voter.has_voted) {
    return (
      <Notice
        icon={<CheckCircle2 className="mx-auto text-emerald-600" size={42} aria-hidden="true" />}
        title="이미 투표를 완료했습니다"
        description={`${election.name} — 같은 링크로는 다시 투표할 수 없습니다. 투표 직후 저장된 영수증이 있다면 검증 페이지에서 확인할 수 있습니다.`}
        action={
          <Link
            href="/verify"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            영수증 검증
          </Link>
        }
      />
    );
  }

  if (election.status === "closed") {
    return (
      <Notice
        icon={<BarChart3 className="mx-auto text-slate-500" size={42} aria-hidden="true" />}
        title="종료된 선거입니다"
        description={`${election.name} — 투표가 마감되어 더 이상 참여할 수 없습니다.`}
        action={
          <Link
            href="/results"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            결과 보기
          </Link>
        }
      />
    );
  }

  if (election.status !== "active") {
    return (
      <Notice
        icon={<Clock className="mx-auto text-amber-600" size={42} aria-hidden="true" />}
        title={`선거가 ${statusLabel(election.status)} 상태입니다`}
        description={`${election.name} — 투표가 시작되면 같은 링크로 다시 접속해 참여할 수 있습니다.`}
      />
    );
  }

  return (
    <TokenBallotClient
      election={election}
      token={token}
      voterName={voter.voter_name}
    />
  );
}

function Notice({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl">
      <Panel className="p-6 text-center">
        {icon}
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action}
      </Panel>
    </div>
  );
}
