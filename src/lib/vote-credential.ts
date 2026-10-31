import { createHash } from "node:crypto";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { getRequestUser, getUserEmail } from "@/lib/supabase/auth";
import { getVoterCodePepper, hashVoterCode, normalizeVoterCode } from "@/lib/voter-code";

export type VoteRegistry = { id: string; election_id: string; has_voted: boolean; token_expires_at: string | null; phone: string | null };
/** 공개 조회/OTP/접수에서 같은 자격 경계를 사용한다. 전화번호 입력으로 찾지 않는다. */
export async function resolveVoteCredential(request: Request, body: Record<string, unknown>, options: {allowExpired?: boolean} = {}) {
  const db = getServiceDbSupabase();
  let query = db.from("voter_registry").select("id,election_id,has_voted,token_expires_at,phone");
  if (typeof body.token === "string" && body.token.length <= 512) query = query.eq("token_hash", createHash("sha256").update(body.token.trim()).digest("hex"));
  else if (body.code !== undefined) {
    const code = normalizeVoterCode(body.code), pepper = getVoterCodePepper();
    if (!code || !pepper) return null;
    query = query.eq("code_hash", hashVoterCode(code, pepper));
  } else {
    if (typeof body.electionId !== "string") return null;
    const user = await getRequestUser(request);
    if (!user) return null;
    const { data: e, error } = await db.from("elections").select("auth_mode").eq("id", body.electionId).maybeSingle();
    if (error || !e || e.auth_mode === "sms_token") return null;
    query = query.eq("election_id", body.electionId);
    if (e.auth_mode === "member_session") query = query.eq("auth_user_id", user.user.id);
    else {
      // OR filter 문자열에 이메일을 삽입하지 않는다.
      const { data: own, error: ownError } = await query.eq("user_id", user.user.id).maybeSingle();
      if (ownError) throw new Error("자격 조회 실패");
      if (own) return own as VoteRegistry;
      query = db.from("voter_registry").select("id,election_id,has_voted,token_expires_at,phone").eq("election_id", body.electionId).ilike("email", getUserEmail(user.user).replaceAll("%", "\\%").replaceAll("_", "\\_"));
    }
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("투표 자격을 확인하지 못했습니다.");
  if (!data || (!options.allowExpired && data.token_expires_at && Date.parse(data.token_expires_at) <= Date.now())) return null;
  return data as VoteRegistry;
}
