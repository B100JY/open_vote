import type { Database } from "@/lib/supabase/database.types";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getCreditPerVoter } from "@/lib/billing";
import type { NewVoter } from "@/lib/voters";
import type { Candidate } from "@/lib/types";

type Json = Database["app_open_vote"]["Tables"]["elections"]["Row"]["candidates"];

export type ElectionRow = Database["app_open_vote"]["Tables"]["elections"]["Row"];
export type VoterRow = Database["app_open_vote"]["Tables"]["voter_registry"]["Row"];

export type CreateElectionInput = {
  creatorId: string;
  name: string;
  description?: string;
  candidates: Candidate[];
  voters: NewVoter[];
};

export type CreateElectionResult =
  | {
      ok: true;
      election: ElectionRow;
      voters: VoterRow[];
      billing: { unitPrice: number; voterCount: number; cost: number; balance: number };
    }
  | { ok: false; status: number; error: string; message: string };

const MAX_VOTERS = 10_000;

function cleanCandidatesInput(candidates: unknown): Candidate[] {
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

export { cleanCandidatesInput };

/**
 * 선거 + 유권자 명부 생성과 포인트 차감(유권자 1인당 단가)을
 * DB 함수(create_billed_election) 한 트랜잭션으로 처리합니다.
 * 잔액 부족 시 아무것도 생성되지 않고 402를 반환합니다.
 *
 * [과금 모델] 이 경로는 "소유자 포인트"(point_wallets) 기반의 독립형 선거 과금이다
 * (관리자/생성자가 웹앱에서 직접 생성 → POST /api/elections). nozolink 연동 선거는
 * 조합 지갑(union_point_wallets) 기반의 create_election_with_billing 을 쓴다.
 */
export async function createBilledElection(
  input: CreateElectionInput,
): Promise<CreateElectionResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, status: 400, error: "invalid_name", message: "투표명을 입력해주세요." };
  }

  if (input.candidates.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_candidates",
      message: "최소 한 개 이상의 투표 항목을 등록해주세요.",
    };
  }

  if (input.voters.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_voters",
      message: "유권자를 한 명 이상 등록해주세요. (휴대폰 번호 또는 이메일)",
    };
  }

  if (input.voters.length > MAX_VOTERS) {
    return {
      ok: false,
      status: 400,
      error: "too_many_voters",
      message: `유권자는 한 번에 최대 ${MAX_VOTERS.toLocaleString()}명까지 등록할 수 있습니다.`,
    };
  }

  const unitPrice = getCreditPerVoter();
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("create_billed_election", {
    p_creator: input.creatorId,
    p_name: name,
    p_description: input.description?.trim() ?? "",
    p_candidates: input.candidates as unknown as Json,
    p_voters: input.voters as unknown as Json,
    p_unit_price: unitPrice,
  });

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      message: `투표 생성 중 오류가 발생했습니다. (${error.message})`,
    };
  }

  const result = data as
    | {
        success?: boolean;
        error?: string;
        message?: string;
        election_id?: string;
        voter_count?: number;
        cost?: number;
        balance?: number;
        required?: number;
      }
    | null;

  if (!result?.success || !result.election_id) {
    const status = result?.error === "insufficient_credits" ? 402 : 400;
    const message =
      result?.error === "insufficient_credits"
        ? `포인트 잔액이 부족합니다. (필요 ${Number(result?.required ?? 0).toLocaleString()}P, 보유 ${Number(result?.balance ?? 0).toLocaleString()}P)`
        : (result?.message ?? "투표 생성에 실패했습니다.");
    return { ok: false, status, error: result?.error ?? "create_failed", message };
  }

  const [{ data: election }, { data: voters }] = await Promise.all([
    supabase.from("elections").select("*").eq("id", result.election_id).single(),
    supabase
      .from("voter_registry")
      .select("*")
      .eq("election_id", result.election_id)
      .order("created_at", { ascending: true }),
  ]);

  if (!election) {
    return {
      ok: false,
      status: 500,
      error: "internal_error",
      message: "생성된 선거 정보를 불러오지 못했습니다.",
    };
  }

  await supabase.from("audit_logs").insert({
    event_type: "voter_registry_created",
    election_id: election.id,
    details: {
      count: result.voter_count ?? input.voters.length,
      cost: result.cost ?? 0,
      unit_price: unitPrice,
      actor: input.creatorId,
      created_at: new Date().toISOString(),
    },
  });

  return {
    ok: true,
    election,
    voters: voters ?? [],
    billing: {
      unitPrice,
      voterCount: result.voter_count ?? input.voters.length,
      cost: result.cost ?? 0,
      balance: result.balance ?? 0,
    },
  };
}
