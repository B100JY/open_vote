import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-client-auth";
import { cleanCandidatesInput, createBilledElection } from "@/lib/create-election";
import { getVoteLinkBaseUrl, sendVoteInviteSms } from "@/lib/sms-invite";
import { getServiceSupabase } from "@/lib/supabase/server";
import { cleanVoters } from "@/lib/voters";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 외부 앱 연동용 투표 생성 API.
 *
 * 인증: `X-Api-Key` 헤더 (관리자에게 발급받은 `ovk_...` 키)
 * 과금: 키 소유자 포인트 계정에서 유권자 1인당 단가 차감
 *
 * POST body:
 * {
 *   "name": "2026년 임원 선거",
 *   "description": "설명(선택)",
 *   "candidates": ["찬성", "반대"] 또는 [{"name": "홍길동", "description": "..."}],
 *   "voters": [{"phone": "010-1234-5678", "name": "홍길동"}, ...],
 *   "activate": true,      // 생성 즉시 진행중으로 전환 (기본 false=준비중)
 *   "sendSms": true,       // 진행중 전환 후 투표 링크 SMS 발송 (activate 필요)
 *   "dryRun": false        // sendSms 미리보기(실발송·과금 없음)
 * }
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiClient(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    const rawCandidates = Array.isArray(body.candidates)
      ? body.candidates.map((item) =>
          typeof item === "string" ? { name: item } : item,
        )
      : [];
    const candidates = cleanCandidatesInput(rawCandidates);

    const { voters, invalid } = cleanVoters(body.voters);
    if (invalid.length > 0) {
      return jsonError(
        `유효하지 않은 전화번호 또는 이메일이 있습니다: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " 외" : ""}`,
        400,
        "invalid_voter_input",
      );
    }

    const activate = body.activate === true;
    const sendSms = body.sendSms === true;
    const dryRun = body.dryRun === true;

    if (sendSms && !activate) {
      return jsonError(
        "sendSms는 activate: true와 함께만 사용할 수 있습니다. 준비중(draft) 선거는 투표를 받을 수 없습니다.",
        400,
        "send_sms_requires_activate",
      );
    }

    const result = await createBilledElection({
      creatorId: auth.client.owner_user_id,
      name,
      description,
      candidates,
      voters,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status, result.error);
    }

    const supabase = getServiceSupabase();
    let election = result.election;

    if (activate) {
      const { data: updated, error: updateError } = await supabase
        .from("elections")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", election.id)
        .select("*")
        .single();

      if (updateError || !updated) {
        return NextResponse.json(
          {
            election: normalizeElection(election),
            billing: result.billing,
            warning: "선거는 생성되었지만 진행중 전환에 실패했습니다. 관리 화면에서 수동으로 시작해주세요.",
          },
          { status: 207 },
        );
      }
      election = updated;

      await supabase.from("audit_logs").insert({
        event_type: "election_status_changed",
        election_id: election.id,
        details: {
          status: "active",
          actor: auth.client.owner_user_id,
          api_client: auth.client.id,
          changed_at: new Date().toISOString(),
        },
      });
    }

    let sms = null;
    if (sendSms) {
      const smsResult = await sendVoteInviteSms({
        electionId: election.id,
        baseUrl: getVoteLinkBaseUrl(request),
        dryRun,
        actorId: auth.client.owner_user_id,
      });

      if (!smsResult.ok) {
        return NextResponse.json(
          {
            election: normalizeElection(election),
            billing: result.billing,
            warning: `선거는 생성되었지만 문자 발송에 실패했습니다: ${smsResult.message}`,
            smsError: smsResult.error,
          },
          { status: 207 },
        );
      }

      const { requested, sent, failed, skipped, batchId } = smsResult.summary;
      sms = { requested, sent, failed, skipped, dryRun: smsResult.summary.dryRun, batchId };
    }

    return NextResponse.json({
      election: normalizeElection(election),
      voters: result.voters.map((voter) => ({
        id: voter.id,
        phone: voter.phone,
        email: voter.email,
        name: voter.voter_name,
      })),
      billing: result.billing,
      sms,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 생성 중 오류가 발생했습니다.",
      500,
    );
  }
}
