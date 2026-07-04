import type { Database } from "@/lib/supabase/database.types";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  getNotifierConfig,
  sendNotifierBatch,
  SimplyNotifierError,
  type NotifierRecipient,
  type NotifierRecipientResult,
} from "@/lib/simply-notifier";
import { createVoterToken, hashVoterToken } from "@/lib/voter-token";

type Json = Database["app_open_vote"]["Tables"]["audit_logs"]["Row"]["details"];

export type SmsInviteSummary = {
  requested: number;
  sent: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
  batchId: string | null;
  results: NotifierRecipientResult[];
};

export type SmsInviteResult =
  | { ok: true; summary: SmsInviteSummary }
  | { ok: false; status: number; error: string; message: string };

/**
 * 투표 링크(/v/<token>)의 기준 URL.
 * 배포 도메인이 요청 origin과 다른 경우 `VOTE_LINK_BASE_URL`로 고정하세요.
 */
export function getVoteLinkBaseUrl(request?: Request): string {
  const fromEnv =
    process.env.VOTE_LINK_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  if (request) {
    const origin = request.headers.get("origin");
    if (origin) {
      return origin.replace(/\/+$/, "");
    }
    return new URL(request.url).origin;
  }
  return "";
}

/**
 * 진행중(active) 선거의 미투표 유권자(전화번호 보유)에게 개인화된 투표 링크를
 * simply-notifier `/v1/notifications`로 발송합니다.
 *
 * - 발송 직전 유권자별 링크 토큰을 새로 생성해 해시만 DB에 저장(회전)하므로,
 *   재발송하면 이전에 보낸 링크는 무효화됩니다.
 * - dry-run은 토큰을 DB에 반영하지 않고 notifier 렌더 미리보기만 받습니다
 *   (미리보기 URL은 실제로 동작하지 않는 일회용 링크입니다).
 * - 멱등키를 일부러 쓰지 않습니다: 토큰이 매 요청 회전되므로 notifier가 이전
 *   응답을 재생하면 이미 무효화된 링크가 "발송됨"으로 보이게 됩니다. 대신
 *   자동 재시도를 하지 않고 결과를 그대로 반환합니다.
 */
export async function sendVoteInviteSms({
  electionId,
  baseUrl,
  dryRun = false,
  resendAll = false,
  actorId,
}: {
  electionId: string;
  baseUrl: string;
  dryRun?: boolean;
  /** true면 이미 발송된(invited_at 존재) 미투표 유권자에게도 새 링크를 재발송 */
  resendAll?: boolean;
  actorId: string;
}): Promise<SmsInviteResult> {
  const config = getNotifierConfig();
  if (!config) {
    return {
      ok: false,
      status: 503,
      error: "notifier_not_configured",
      message:
        "SMS 발송 서버가 설정되지 않았습니다. SIMPLY_NOTIFIER_APP_ID / SIMPLY_NOTIFIER_API_SECRET 환경 변수를 확인해주세요.",
    };
  }

  if (!baseUrl) {
    return {
      ok: false,
      status: 500,
      error: "missing_base_url",
      message: "투표 링크 기준 URL을 결정하지 못했습니다. VOTE_LINK_BASE_URL을 설정해주세요.",
    };
  }

  const supabase = getServiceSupabase();

  const { data: election, error: electionError } = await supabase
    .from("elections")
    .select("id, name, status")
    .eq("id", electionId)
    .maybeSingle();

  if (electionError || !election) {
    return {
      ok: false,
      status: 404,
      error: "election_not_found",
      message: "선거 정보를 찾을 수 없습니다.",
    };
  }

  if (election.status !== "active") {
    return {
      ok: false,
      status: 409,
      error: "election_not_active",
      message: "진행중 상태의 선거만 문자를 발송할 수 있습니다.",
    };
  }

  let query = supabase
    .from("voter_registry")
    .select("id, phone, voter_name")
    .eq("election_id", electionId)
    .eq("has_voted", false)
    .not("phone", "is", null);

  if (!resendAll) {
    query = query.is("invited_at", null);
  }

  const { data: voters, error: votersError } = await query;

  if (votersError) {
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      message: "유권자 명부를 불러오지 못했습니다.",
    };
  }

  const targets = (voters ?? [])
    .filter((voter) => voter.phone)
    .map((voter) => ({ voter, token: createVoterToken() }));

  if (targets.length === 0) {
    return {
      ok: true,
      summary: {
        requested: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        dryRun,
        batchId: null,
        results: [],
      },
    };
  }

  if (!dryRun) {
    const { error: rotateError } = await supabase.rpc("rotate_voter_tokens", {
      p_election_id: electionId,
      p_tokens: targets.map(({ voter, token }) => ({
        id: voter.id,
        hash: hashVoterToken(token),
      })) as unknown as Json,
    });

    if (rotateError) {
      return {
        ok: false,
        status: 500,
        error: "internal_error",
        message: `투표 링크 토큰 갱신에 실패했습니다. (${rotateError.message})`,
      };
    }
  }

  const recipients: NotifierRecipient[] = targets.map(({ voter, token }) => ({
    phone: voter.phone as string,
    ref: voter.id,
    variables: {
      name: voter.voter_name?.trim() || "유권자",
      url: `${baseUrl}/v/${token}`,
    },
  }));

  let batch;
  try {
    batch = await sendNotifierBatch(config, { recipients, dryRun });
  } catch (caught) {
    if (caught instanceof SimplyNotifierError) {
      const retryAfter =
        caught.detail && typeof caught.detail === "object" && "retry_after" in caught.detail
          ? Number((caught.detail as { retry_after?: unknown }).retry_after)
          : null;
      return {
        ok: false,
        status: caught.status === 429 ? 429 : 502,
        error: caught.code,
        message:
          caught.status === 429
            ? `발송 한도를 초과했습니다.${retryAfter ? ` ${retryAfter}초 후 다시 시도해주세요.` : ""}`
            : `SMS 발송에 실패했습니다. (${caught.code})`,
      };
    }
    return {
      ok: false,
      status: 502,
      error: "notifier_unreachable",
      message: "SMS 발송 서버에 연결하지 못했습니다.",
    };
  }

  if (!dryRun) {
    const sentIds = batch.results
      .filter((result) => result.status === "sent" && result.ref)
      .map((result) => result.ref as string);

    if (sentIds.length > 0) {
      await supabase
        .from("voter_registry")
        .update({ invited_at: new Date().toISOString() })
        .in("id", sentIds);
    }

    await supabase.from("audit_logs").insert({
      event_type: "sms_invites_sent",
      election_id: electionId,
      details: {
        batch_id: batch.batch_id,
        requested: batch.requested,
        sent: batch.sent,
        failed: batch.failed,
        skipped: batch.skipped,
        resend_all: resendAll,
        actor: actorId,
        sent_at: new Date().toISOString(),
      },
    });
  }

  return {
    ok: true,
    summary: {
      requested: batch.requested,
      sent: batch.sent,
      failed: batch.failed,
      skipped: batch.skipped,
      dryRun: batch.dry_run,
      batchId: batch.batch_id ?? null,
      results: batch.results,
    },
  };
}
