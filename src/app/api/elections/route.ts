import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { Candidate, ElectionStatus } from "@/lib/types";
import { normalizeElection } from "@/lib/utils";

export const dynamic = "force-dynamic";
const statuses = new Set<ElectionStatus>(["draft", "active", "paused", "closed"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanCandidates(candidates: unknown): Candidate[] {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const record = candidate as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";

      if (!name) {
        return null;
      }

      const cleaned: Candidate = {
        id:
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : `candidate_${index + 1}`,
        name,
      };
      const description =
        typeof record.description === "string" ? record.description.trim() : "";
      if (description) {
        cleaned.description = description;
      }

      return cleaned;
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
}

function cleanEmails(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]/)
      : [];

  return Array.from(
    new Set(
      raw
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => item && emailPattern.test(item)),
    ),
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const visibility = searchParams.get("visibility");
    const supabase = getServiceSupabase();

    let query = supabase
      .from("elections")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && statuses.has(status as ElectionStatus)) {
      query = query.eq("status", status as ElectionStatus);
    } else if (visibility === "public") {
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
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const voterEmails = cleanEmails(body.voterEmails);
    const voterCount = voterEmails.length || Number(body.voterCount);
    const candidates = cleanCandidates(body.candidates);

    if (!name) {
      return jsonError("투표명을 입력해주세요.");
    }

    if (!Number.isInteger(voterCount) || voterCount <= 0 || voterEmails.length === 0) {
      return jsonError("유권자 이메일을 한 명 이상 입력해주세요.");
    }

    if (voterCount > 10000) {
      return jsonError("유권자는 한 번에 최대 10,000명까지 등록할 수 있습니다.");
    }

    if (candidates.length === 0) {
      return jsonError("최소 한 개 이상의 투표 항목을 등록해주세요.");
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const supabase = getServiceSupabase();

    const { data: election, error: electionError } = await supabase
      .from("elections")
      .insert({
        name,
        description: description || null,
        candidates,
        total_voter_codes: voterCount,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("*")
      .single();

    if (electionError || !election) {
      return jsonError(
        "투표 생성 중 오류가 발생했습니다.",
        500,
        electionError?.message,
      );
    }

    const { data: voters, error: voterError } = await supabase
      .from("voter_registry")
      .insert(
        voterEmails.map((email) => ({
          election_id: election.id,
          email,
        })),
      )
      .select("*");

    if (voterError) {
      await supabase.from("elections").delete().eq("id", election.id);
      return jsonError(
        "유권자 명부 등록 중 오류가 발생했습니다.",
        500,
        voterError.message,
      );
    }

    await supabase.from("audit_logs").insert({
      event_type: "voter_registry_created",
      election_id: election.id,
      details: {
        count: voters?.length ?? voterCount,
        created_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      election: normalizeElection(election),
      voters: voters ?? [],
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "투표 생성 중 오류가 발생했습니다.",
      500,
    );
  }
}
