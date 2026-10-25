import type { Database } from "@/lib/supabase/database.types";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  getNotifierConfig,
  sendNotifierBatch,
  SimplyNotifierError,
  type NotifierRecipient,
  type NotifierRecipientResult,
} from "@/lib/simply-notifier";
import { defaultSmsTitle } from "@/lib/sms-title";
import { createVoterCode, formatVoterCode, getVoterCodePepper, hashVoterCode } from "@/lib/voter-code";
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
  /** 중간에 멈췄으면 그 이유(앞 묶음은 이미 발송됨) */
  stopped: string | null;
  stoppedStatus?: number;
  stoppedCode?: string;
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
 * - 수신자를 getNotifierChunkSize() 명씩 나눠 보냅니다. 묶음마다 토큰을 회전하고,
 *   문자가 나가지 않은 수신자(발송 실패·건너뜀·요청 오류)는 이전 토큰으로 되돌립니다.
 *   한도 초과(429)나 서버 오류가 나면 거기서 멈추고 앞 묶음까지의 결과를 돌려줍니다.
 */
export async function sendVoteInviteSms({
  electionId,
  baseUrl,
  dryRun = false,
  resendAll = false,
  voterIds,
  actorId,
}: {
  electionId: string;
  baseUrl: string;
  dryRun?: boolean;
  /** true면 이미 발송된(invited_at 존재) 미투표 유권자에게도 새 링크를 재발송 */
  resendAll?: boolean;
  /** 이 유권자들에게만 보낸다(유권자 본인 재발송). 지정하면 발송 이력과 상관없이 보낸다. */
  voterIds?: string[];
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

  const pepper = getVoterCodePepper();
  if (!pepper) {
    return {
      ok: false,
      status: 503,
      error: "code_not_configured",
      message: "투표 코드 설정(OPENVOTE_CODE_PEPPER)이 없습니다. 운영자에게 문의해주세요.",
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
    .select("id, name, status, sms_title")
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

  if (voterIds) {
    query = query.in("id", voterIds.length > 0 ? voterIds : ["00000000-0000-0000-0000-000000000000"]);
  } else if (!resendAll) {
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
    .map((voter) => ({ voter, token: createVoterToken(), code: createVoterCode() }));
  const title = election.sms_title?.trim() || defaultSmsTitle(election.name);

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
        stopped: null,
      },
    };
  }

  const chunkSize = getNotifierChunkSize();
  const summary: SmsInviteSummary = {
    requested: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    dryRun,
    batchId: null,
    results: [],
    stopped: null,
  };
  const batchIds: string[] = [];

  for (let offset = 0; offset < targets.length; offset += chunkSize) {
    const chunk = targets.slice(offset, offset + chunkSize);
    const hashes = new Map(chunk.map(({ voter, token }) => [voter.id, hashVoterToken(token)]));
    let previous: Array<{ id: string; previous_hash: string | null; previous_code_hash: string | null }> = [];

    if (!dryRun) {
      // 코드 해시가 다른 유권자와 겹치면(10억분의 1 수준) 그 묶음 코드를 새로 뽑아 다시 시도한다.
      let rotateError: { message: string; code?: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await supabase.rpc("rotate_voter_tokens", {
          p_election_id: electionId,
          p_tokens: chunk.map(({ voter, code }) => ({
            id: voter.id,
            hash: hashes.get(voter.id),
            code_hash: hashVoterCode(code, pepper),
          })) as unknown as Json,
        });
        rotateError = result.error;
        if (!rotateError) {
          previous = (result.data ?? []) as unknown as typeof previous;
          break;
        }
        if (rotateError.code !== "23505") break;
        for (const target of chunk) target.code = createVoterCode();
      }
      if (rotateError) {
        summary.stopped = `투표 링크 토큰 갱신에 실패했습니다. (${rotateError.message})`;
        break;
      }
    }

    /** 문자가 가지 않은 수신자는 이전 링크를 되살린다(재발송 실패로 이미 받은 링크가 죽지 않게) */
    const restore = async (ids: string[]) => {
      if (dryRun || ids.length === 0) {
        return;
      }
      const wanted = new Set(ids);
      await supabase.rpc("restore_voter_tokens", {
        p_election_id: electionId,
        p_tokens: previous
          .filter((item) => wanted.has(item.id))
          .map((item) => ({
            id: item.id,
            hash: hashes.get(item.id),
            previous_hash: item.previous_hash,
            previous_code_hash: item.previous_code_hash,
          })) as unknown as Json,
      });
    };

    // 템플릿(notifier, 총괄관리자 편집)은 {title} {name} {url} {code} 를 쓸 수 있다. 안 쓰는 변수는 무시된다.
    const recipients: NotifierRecipient[] = chunk.map(({ voter, token, code }) => ({
      phone: voter.phone as string,
      ref: voter.id,
      variables: {
        title,
        name: voter.voter_name?.trim() || "유권자",
        url: `${baseUrl}/v/${token}`,
        code: formatVoterCode(code),
      },
    }));

    let batch;
    try {
      batch = await sendNotifierBatch(config, { recipients, dryRun });
    } catch (caught) {
      await restore(chunk.map(({ voter }) => voter.id));
      if (caught instanceof SimplyNotifierError) {
        const retryAfter =
          caught.detail && typeof caught.detail === "object" && "retry_after" in caught.detail
            ? Number((caught.detail as { retry_after?: unknown }).retry_after)
            : null;
        summary.stopped =
          caught.status === 429
            ? `발송 한도를 초과했습니다.${retryAfter ? ` ${retryAfter}초 후 다시 시도해주세요.` : ""}`
            : `SMS 발송에 실패했습니다. (${caught.code})`;
        summary.stoppedStatus = caught.status === 429 ? 429 : 502;
        summary.stoppedCode = caught.code;
      } else {
        summary.stopped = "SMS 발송 서버에 연결하지 못했습니다.";
        summary.stoppedStatus = 502;
        summary.stoppedCode = "notifier_unreachable";
      }
      break;
    }

    summary.requested += batch.requested;
    summary.sent += batch.sent;
    summary.failed += batch.failed;
    summary.skipped += batch.skipped;
    summary.dryRun = batch.dry_run;
    summary.results.push(...batch.results);
    if (batch.batch_id) {
      batchIds.push(batch.batch_id);
    }

    if (!dryRun) {
      const sentIds = new Set(
        batch.results
          .filter((result) => result.status === "sent" && result.ref)
          .map((result) => result.ref as string),
      );
      await restore(chunk.map(({ voter }) => voter.id).filter((id) => !sentIds.has(id)));

      if (sentIds.size > 0) {
        await supabase
          .from("voter_registry")
          .update({ invited_at: new Date().toISOString() })
          .in("id", [...sentIds]);
      }
    }
  }

  summary.batchId = batchIds[0] ?? null;

  if (summary.requested === 0 && summary.stopped) {
    return {
      ok: false,
      status: summary.stoppedStatus ?? 500,
      error: summary.stoppedCode ?? "internal_error",
      message: summary.stopped,
    };
  }

  if (!dryRun) {
    await supabase.from("audit_logs").insert({
      event_type: "sms_invites_sent",
      election_id: electionId,
      details: {
        batch_ids: batchIds,
        requested: summary.requested,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        resend_all: resendAll,
        targeted: voterIds ? voterIds.length : null,
        stopped: summary.stopped,
        actor: actorId,
        sent_at: new Date().toISOString(),
      },
    });
  }

  return { ok: true, summary };
}

/**
 * notifier 1회 호출당 수신자 수. 서버 한도(notify_max_recipients, 기본 1000)보다 작게 둔다.
 * 한 번에 몰아 보내면 1000명을 넘는 명부는 통째로 거절된다.
 */
export function getNotifierChunkSize() {
  const value = Number(process.env.SIMPLY_NOTIFIER_MAX_BATCH ?? 500);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 1000) : 500;
}
