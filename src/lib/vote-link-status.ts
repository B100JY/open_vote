import { getServiceDbSupabase } from "@/lib/supabase/server";
import { normalizeElection } from "@/lib/utils";

type RegistryRow = {
  id: string;
  election_id: string;
  has_voted: boolean;
  token_expires_at: string | null;
};

/**
 * 문자 링크 토큰·투표 코드 공용 상태 조회. 선거·후보·투표 방식·참여 여부만 돌려준다(개인정보 없음).
 * column 은 token_hash 또는 code_hash. 없으면 null.
 */
export async function loadVoterLinkStatus(column: "token_hash" | "code_hash", hash: string) {
  const supabase = getServiceDbSupabase();
  await supabase.rpc("close_expired_elections");

  const { data: registry } = await supabase
    .from("voter_registry")
    .select("id, election_id, has_voted, token_expires_at")
    .eq(column, hash)
    .maybeSingle<RegistryRow>();
  if (!registry) return null;

  const { data: row } = await supabase.from("elections").select("*").eq("id", registry.election_id).maybeSingle();
  if (!row) return null;

  const election = normalizeElection(row);
  const now = Date.now();
  return {
    election: {
      id: election.id,
      name: election.name,
      description: election.description,
      candidates: election.candidates,
      status: election.status,
      starts_at: election.starts_at,
      ends_at: election.ends_at,
      ballot_type: election.ballot_type,
      min_choices: election.min_choices,
      max_choices: election.max_choices,
      allow_blank: election.allow_blank,
    },
    hasVoted: registry.has_voted,
    expired: registry.token_expires_at ? new Date(registry.token_expires_at).getTime() < now : false,
    ended: election.ends_at ? new Date(election.ends_at).getTime() <= now : false,
    notStarted: election.starts_at ? new Date(election.starts_at).getTime() > now : false,
  };
}
