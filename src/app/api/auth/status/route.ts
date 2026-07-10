import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { getRequestUser, getUserEmail } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RegistryRow = {
  id: string;
  election_id: string;
  user_id: string | null;
  email: string | null;
  has_voted: boolean;
  voted_at: string | null;
};

const registrySelect = "id, election_id, user_id, email, has_voted, voted_at";

export async function GET(request: Request) {
  try {
    const userInfo = await getRequestUser(request);
    if (!userInfo) {
      return jsonError("로그인이 필요합니다.", 401, "unauthorized");
    }

    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get("electionId")?.trim() ?? "";
    if (!electionId) {
      return jsonError("선거 ID가 필요합니다.", 400, "missing_election_id");
    }

    const supabase = getServiceDbSupabase();
    const userEmail = getUserEmail(userInfo.user);

    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("id, name, status, auth_mode")
      .eq("id", electionId)
      .maybeSingle<{ id: string; name: string; status: string; auth_mode: string }>();

    if (electionError || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    // 1) member_session: 사전 지정된 auth_user_id 명부
    const { data: registryByAuthUser, error: authUserError } =
      election.auth_mode === "member_session"
        ? await supabase
            .from("voter_registry")
            .select(registrySelect)
            .eq("election_id", electionId)
            .eq("auth_user_id", userInfo.user.id)
            .maybeSingle<RegistryRow>()
        : { data: null, error: null };

    if (authUserError) {
      return jsonError("유권자 상태를 확인하지 못했습니다.", 500, authUserError.message);
    }

    // 2) user_id 클레임
    const { data: registryByUser, error: registryByUserError } = registryByAuthUser
      ? { data: null, error: null }
      : await supabase
          .from("voter_registry")
          .select(registrySelect)
          .eq("election_id", electionId)
          .eq("user_id", userInfo.user.id)
          .maybeSingle<RegistryRow>();

    if (registryByUserError) {
      return jsonError("유권자 상태를 확인하지 못했습니다.", 500, registryByUserError.message);
    }

    // 3) email 매칭(email_link)
    const { data: registryByEmail, error: registryByEmailError } =
      !registryByAuthUser && !registryByUser && userEmail
        ? await supabase
            .from("voter_registry")
            .select(registrySelect)
            .eq("election_id", electionId)
            .ilike("email", userEmail)
            .maybeSingle<RegistryRow>()
        : { data: null, error: null };

    if (registryByEmailError) {
      return jsonError("유권자 상태를 확인하지 못했습니다.", 500, registryByEmailError.message);
    }

    const registry: RegistryRow | null = registryByAuthUser ?? registryByUser ?? registryByEmail;

    if (!registry) {
      return NextResponse.json({
        election,
        registered: false,
        hasVoted: false,
      });
    }

    if (!registry.user_id) {
      await supabase
        .from("voter_registry")
        .update({ user_id: userInfo.user.id, updated_at: new Date().toISOString() })
        .eq("id", registry.id)
        .is("user_id", null);
    }

    return NextResponse.json({
      election,
      registered: true,
      hasVoted: registry.has_voted,
      votedAt: registry.voted_at,
      voter: {
        email: registry.email,
      },
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "유권자 상태를 확인하지 못했습니다.",
      500,
    );
  }
}
