import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { authenticateApiClient } from "@/lib/api-key";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { sendVoteLinks, type VoteSmsTarget } from "@/lib/notifier";
import type { Candidate } from "@/lib/types";

export const dynamic = "force-dynamic";

// [과금 모델] nozolink 연동 선거 생성 API (X-Api-Key 인증).
// 유권자 수 × 단가를 연동 "조합 지갑"(union_point_wallets)에서 선불 차감한다
// (create_election_with_billing / charge_union_points). 관리자가 웹앱에서 직접
// 만드는 독립형 선거는 별도 경로(POST /api/elections, 소유자 포인트 과금)를 쓴다.

type AuthMode = "member_session" | "sms_token";

function cleanCandidates(candidates: unknown): Candidate[] {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return null;
      const record = candidate as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name) return null;
      const cleaned: Candidate = {
        id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `candidate_${index + 1}`,
        name,
      };
      const description = typeof record.description === "string" ? record.description.trim() : "";
      if (description) cleaned.description = description;
      return cleaned;
    })
    .filter((c): c is Candidate => Boolean(c));
}

function cleanMemberVoters(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Array<{ auth_user_id: string; name: string; external_member_id?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const authUserId = typeof record.authUserId === "string" ? record.authUserId.trim() : "";
    if (!/^[0-9a-fA-F-]{36}$/.test(authUserId) || seen.has(authUserId)) continue;
    seen.add(authUserId);
    const entry: { auth_user_id: string; name: string; external_member_id?: string } = {
      auth_user_id: authUserId,
      name: typeof record.name === "string" ? record.name.trim() : "",
    };
    if (typeof record.externalMemberId === "string" && /^[0-9a-fA-F-]{36}$/.test(record.externalMemberId.trim())) {
      entry.external_member_id = record.externalMemberId.trim();
    }
    out.push(entry);
  }
  return out;
}

function cleanSmsVoters(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Array<{ phone: string; name: string; external_member_id?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawPhone = typeof record.phone === "string" ? record.phone.trim() : "";
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 9) continue;
    const e164 = digits.startsWith("82") ? `+${digits}` : digits.startsWith("0") ? `+82${digits.slice(1)}` : `+82${digits}`;
    if (seen.has(e164)) continue;
    seen.add(e164);
    const entry: { phone: string; name: string; external_member_id?: string } = {
      phone: e164,
      name: typeof record.name === "string" ? record.name.trim() : "",
    };
    if (typeof record.externalMemberId === "string" && /^[0-9a-fA-F-]{36}$/.test(record.externalMemberId.trim())) {
      entry.external_member_id = record.externalMemberId.trim();
    }
    out.push(entry);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const client = await authenticateApiClient(request);
    if (!client) {
      return jsonError("유효한 API 키가 필요합니다.", 401, "unauthorized");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const authMode = (typeof body.authMode === "string" ? body.authMode.trim() : "") as AuthMode;
    const nozolinkUnionId = typeof body.nozolinkUnionId === "string" && /^[0-9a-fA-F-]{36}$/.test(body.nozolinkUnionId.trim())
      ? body.nozolinkUnionId.trim()
      : null;
    const candidates = cleanCandidates(body.candidates);
    const creditPerVoter = Number.isFinite(Number(body.creditPerVoter)) ? Math.max(0, Math.floor(Number(body.creditPerVoter))) : 10;
    const activate = body.activate !== false;

    if (!name) return jsonError("투표명을 입력해주세요.");
    if (authMode !== "member_session" && authMode !== "sms_token") {
      return jsonError("지원하지 않는 인증 방식입니다.", 400, "invalid_auth_mode");
    }
    if (candidates.length === 0) return jsonError("최소 한 개 이상의 투표 항목을 등록해주세요.");

    const memberVoters = authMode === "member_session" ? cleanMemberVoters(body.memberVoters) : [];
    const smsVoters = authMode === "sms_token" ? cleanSmsVoters(body.smsVoters) : [];
    const voters = authMode === "member_session" ? memberVoters : smsVoters;
    if (voters.length === 0) return jsonError("유권자 명부가 비어 있습니다.", 400, "empty_roster");

    const now = new Date();
    const startsAt = typeof body.startsAt === "string" && !Number.isNaN(Date.parse(body.startsAt))
      ? new Date(body.startsAt)
      : now;
    const endsAt = typeof body.endsAt === "string" && !Number.isNaN(Date.parse(body.endsAt))
      ? new Date(body.endsAt)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const db = getServiceDbSupabase();

    const { data: rpcResult, error: rpcError } = await db.rpc("create_election_with_billing", {
      p_name: name,
      p_description: description || null,
      p_candidates: candidates,
      p_auth_mode: authMode,
      p_nozolink_union_id: nozolinkUnionId,
      p_owner_user_id: client.owner_user_id,
      p_created_by: client.owner_user_id,
      p_voters: voters,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_credit_per_voter: creditPerVoter,
    });

    if (rpcError) {
      return jsonError("투표 생성 중 오류가 발생했습니다.", 500, rpcError.message);
    }

    const result = rpcResult as
      | {
          success?: boolean;
          error?: string;
          message?: string;
          election_id?: string;
          voter_count?: number;
          charged?: number;
          required?: number;
          balance?: number;
          sms_targets?: Array<{ registry_id: string; phone: string; token: string; name: string }>;
        }
      | null;

    if (!result?.success) {
      if (result?.error === "insufficient_points") {
        return NextResponse.json(
          {
            success: false,
            error: "insufficient_points",
            message: result.message ?? "포인트 잔액이 부족합니다.",
            required: result.required ?? null,
            balance: result.balance ?? null,
          },
          { status: 402 },
        );
      }
      return jsonError(result?.message ?? "투표를 생성하지 못했습니다.", 400, result?.error);
    }

    const electionId = result.election_id as string;

    // 즉시 활성화(기본): 활성화해야 조합원/문자 투표가 가능하다.
    if (activate) {
      await db.from("elections").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", electionId);
    }

    // sms_token: 유권자별 1회용 링크 문자 발송
    let smsSummary: { sent: number; failed: number; skipped: number; error?: string } | null = null;
    if (authMode === "sms_token" && activate) {
      const targets: VoteSmsTarget[] = (result.sms_targets ?? []).map((t) => ({
        registryId: t.registry_id,
        phone: t.phone,
        token: t.token,
        name: t.name,
      }));
      const sendResult = await sendVoteLinks(targets, { idempotencyKey: `election_${electionId}` });
      if (sendResult.ok) {
        smsSummary = { sent: sendResult.sent, failed: sendResult.failed, skipped: sendResult.skipped };
        await db
          .from("voter_registry")
          .update({ token_sent_at: new Date().toISOString() })
          .eq("election_id", electionId)
          .not("token_hash", "is", null);
      } else {
        smsSummary = { sent: 0, failed: targets.length, skipped: 0, error: sendResult.error };
      }
    }

    return NextResponse.json({
      success: true,
      election: {
        id: electionId,
        auth_mode: authMode,
        status: activate ? "active" : "draft",
        nozolink_union_id: nozolinkUnionId,
        voter_count: result.voter_count ?? voters.length,
        charged: result.charged ?? 0,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      },
      sms: smsSummary,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 생성 중 오류가 발생했습니다.",
      500,
    );
  }
}
