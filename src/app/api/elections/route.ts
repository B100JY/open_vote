import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getRequestUser, requireVoteCreator } from "@/lib/supabase/auth";
import { isAdminUser, isVoteCreator } from "@/lib/admin-role";
import { getServiceSupabase } from "@/lib/supabase/server";
import { cleanCandidatesInput, createBilledElection } from "@/lib/create-election";
import { cleanVoters, votersFromEmails } from "@/lib/voters";
import type { ElectionStatus } from "@/lib/types";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";
const statuses = new Set<ElectionStatus>(["draft", "active", "paused", "closed"]);
// 비관리자(공개)에게 노출 가능한 상태
const publicStatuses = new Set<ElectionStatus>(["active", "closed"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const userInfo = await getRequestUser(request);
    const admin = userInfo ? isAdminUser(userInfo.user) : false;
    const creator = userInfo ? isVoteCreator(userInfo.user) : false;
    const supabase = getServiceSupabase();

    let query = supabase
      .from("elections")
      .select("*")
      .order("created_at", { ascending: false });

    if (admin) {
      // 관리자는 draft/paused 포함 모든 상태를 조회할 수 있습니다.
      if (status && statuses.has(status as ElectionStatus)) {
        query = query.eq("status", status as ElectionStatus);
      }
    } else if (creator && userInfo) {
      // 투표 생성자는 공개 상태 + 자신이 만든 선거(draft/paused 포함)를 조회합니다.
      query = query.or(
        `status.in.(active,closed),created_by.eq.${userInfo.user.id}`,
      );
      if (status && statuses.has(status as ElectionStatus)) {
        query = query.eq("status", status as ElectionStatus);
      }
    } else if (status && publicStatuses.has(status as ElectionStatus)) {
      // 비관리자는 공개 상태(active/closed)만 필터링할 수 있습니다.
      query = query.eq("status", status as ElectionStatus);
    } else {
      // 그 외(필터 없음, draft 요청 등)는 공개 상태만 반환합니다.
      query = query.in("status", ["active", "closed"]);
    }

    const { data, error } = await query;

    if (error) {
      return jsonError("선거 목록을 불러오지 못했습니다.", 500, error.message);
    }

    return NextResponse.json({
      elections: (data ?? []).map((election) => normalizeElection(election)),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 목록을 불러오지 못했습니다.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const candidates = cleanCandidatesInput(body.candidates);

    // 신규 입력(voters: [{phone, name, email}]) 우선, 레거시(voterEmails)도 지원
    const { voters: phoneVoters, invalid } = cleanVoters(body.voters);
    const voters =
      phoneVoters.length > 0 ? phoneVoters : votersFromEmails(body.voterEmails);

    if (invalid.length > 0) {
      return jsonError(
        `유효하지 않은 전화번호 또는 이메일이 있습니다: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " 외" : ""}`,
        400,
        "invalid_voter_input",
      );
    }

    const result = await createBilledElection({
      creatorId: auth.user.user.id,
      name,
      description,
      candidates,
      voters,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status, result.error);
    }

    return NextResponse.json({
      election: normalizeElection(result.election),
      voters: result.voters,
      billing: result.billing,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 생성 중 오류가 발생했습니다.",
      500,
    );
  }
}
