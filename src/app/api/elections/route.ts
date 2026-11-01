import { NextResponse } from "next/server";
import { electionForViewer } from "@/lib/election-view-access";
import { jsonError } from "@/lib/api-response";
import { requireAdmin, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase, getServiceDbSupabase } from "@/lib/supabase/server";
import { cleanBallotRules } from "@/lib/ballot";
import { cleanCandidatesInput, createBilledElection } from "@/lib/create-election";
import { cleanVoters, votersFromEmails } from "@/lib/voters";
import type { ElectionStatus } from "@/lib/types";
import { checkSmsTitle } from "@/lib/sms-title";
import { normalizeElection } from "@/lib/utils";
import { electionPeriodError } from "@/lib/election-period";
import { canViewElection } from "@/lib/election-view-access";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const statuses = new Set<ElectionStatus>(["draft", "active", "paused", "closed"]);
// 비관리자(공개)에게 노출 가능한 상태
const publicStatuses = new Set<ElectionStatus>(["active", "closed"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    // 구버전 관리 화면도 인증 헤더가 있으면 본인 목록으로 제한한다.
    const scope = searchParams.get("scope") ?? (searchParams.get("visibility") === "public" ? "public" : request.headers.has("authorization") ? "mine" : "public");
    if (!["public", "mine", "all"].includes(scope)) return jsonError("목록 범위를 확인해주세요.",400);
    const auth = scope === "all" ? await requireAdmin(request) : scope === "mine" ? await requireVoteCreator(request) : null;
    if (auth && !auth.ok) return jsonError(auth.message,auth.status,auth.error);
    const trash = searchParams.get("trash") === "1";
    if (trash && scope === "public") return jsonError("로그인이 필요합니다.",401);
    const supabase = getServiceSupabase();
    // 마감 시각이 지난 선거를 먼저 닫는다(별도 스케줄러 없이 조회 때 정리)
    await supabase.rpc("close_expired_elections");

    let query = supabase
      .from("elections")
      .select("*")
      .order("created_at", { ascending: false });
    query = trash ? query.not("trashed_at", "is", null) : query.is("trashed_at", null);

    if (scope === "all") {
      // 관리자 전용 전체 목록. 공개 목록이나 내 목록과 합치지 않는다.
      if (status && statuses.has(status as ElectionStatus)) {
        query = query.eq("status", status as ElectionStatus);
      }
    } else if (scope === "mine" && auth?.ok) {
      query = query.eq("created_by", auth.user.user.id);
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

    const counts = new Map<string,number>();
    if (trash && data?.length) {
      const {data: objections,error: oe} = await getServiceDbSupabase().from("election_objections").select("election_id").in("election_id",data.map(e=>e.id));
      if(oe) return jsonError("이의제기 상태를 확인하지 못했습니다.",503);
      for(const o of objections??[]) counts.set(o.election_id,(counts.get(o.election_id)??0)+1);
    }
    const rows = [];
    for (const election of data ?? []) {
      if (scope === "public" && !await canViewElection(request, election)) rows.push({id:election.id,name:election.name,content_restricted:true,restricted:true});
      else rows.push(normalizeElection({...scope === "public" ? await electionForViewer(request,election) : election,objection_count:counts.get(election.id)??0}));
    }
    return NextResponse.json({
      elections: rows,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "선거 목록을 불러오지 못했습니다.",
      500,
    );
  }
}

// [과금 모델] 독립형 관리자/생성자 선거 생성 (세션 인증, requireVoteCreator).
// 생성 자체는 무료이며 문자 발송 때 포인트를 예약·사용한다.
// (createBilledElection → create_billed_election 단가 0). nozolink 연동 선거는 별도 경로
// (POST /api/v1/elections, 조합 지갑 과금)를 쓴다.
export async function POST(request: Request) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body.descriptionPublic !== undefined && typeof body.descriptionPublic !== "boolean") return jsonError("설명 공개 설정을 확인해주세요.",400);
    if (body.organizationName !== undefined && (typeof body.organizationName !== "string" || body.organizationName.trim().length > 120)) return jsonError("단체명은 120자 이내로 입력해주세요.",400);
    if (body.contentRestricted !== undefined && typeof body.contentRestricted !== "boolean") return jsonError("내용 공개 설정을 확인해주세요.",400);
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

    const smsTitle = checkSmsTitle(body.smsTitle);
    if (!smsTitle.ok) {
      return jsonError(smsTitle.message, 400, "invalid_sms_title");
    }

    const rules = cleanBallotRules(body, candidates.length);
    if (!rules.ok) {
      return jsonError(rules.message, 400, "invalid_ballot_rules");
    }

    // 기간: 시작 미지정 = 지금, 마감은 필수
    const startsAt = parseDate(body.startsAt) ?? new Date();
    const endsAt = parseDate(body.endsAt);
    if (!endsAt) {
      return jsonError("투표 마감 일시를 입력해주세요.", 400, "invalid_period");
    }
    const periodError = electionPeriodError(startsAt, endsAt);
    if (periodError) return jsonError(periodError, 400, "invalid_period");

    const result = await createBilledElection({
      contentRestricted: body.contentRestricted !== false,
      organizationName: typeof body.organizationName === "string" ? body.organizationName.trim() : "",
      descriptionPublic: body.descriptionPublic === true,
      creatorId: auth.user.user.id,
      audit: body.enableAudit === true,
      smsRequired: body.smsRequired === true,
      name,
      description,
      candidates,
      voters,
      rules: rules.rules,
      startsAt,
      endsAt,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status, result.error);
    }

    scheduleNotifications();
    let created = result.election;
    if (smsTitle.value) {
      const { data: titled } = await getServiceSupabase()
        .from("elections")
        .update({ sms_title: smsTitle.value })
        .eq("id", result.election.id)
        .select("*")
        .single();
      if (titled) created = titled;
    }

    return NextResponse.json({
      election: normalizeElection(created),
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

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
import { scheduleNotifications } from "@/lib/admin-notifications";
