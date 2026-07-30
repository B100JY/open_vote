import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { canManageElection, requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 이메일 유권자에게 Supabase Auth 매직 링크 발송(레거시 채널). SMS는 sms-invite 참고 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const { id } = await context.params;
    const supabase = getServiceSupabase();
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const redirectTo = `${origin}/vote/${id}/auth`;

    const { data: election, error: electionError } = await supabase
      .from("elections")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (electionError || !election) {
      return jsonError("선거 정보를 찾을 수 없습니다.", 404, electionError?.message);
    }

    if (!canManageElection(auth, election.created_by)) {
      return jsonError("이 선거의 링크를 발송할 권한이 없습니다.", 403, "forbidden");
    }

    const { data: voters, error } = await supabase
      .from("voter_registry")
      .select("id, email, has_voted")
      .eq("election_id", id)
      .eq("has_voted", false)
      .not("email", "is", null);

    if (error) {
      return jsonError("유권자 명부를 불러오지 못했습니다.", 500, error.message);
    }

    let sent = 0;
    let failed = 0;
    const pendingVoters = (voters ?? []).filter((voter) => voter.email);

    // inviteUserByEmail 은 OpenVote 가 공유 auth.users 에 계정을 **새로 만드는**
    // 유일한 지점이다. 그 계정은 voter_registry(ON DELETE SET NULL)에만 흔적을
    // 남기므로, 과금 FK 5개에 건 RESTRICT(20260731000000)로 보호되지 않는다.
    // 지금은 초대로 만든 계정이 0건이고 피해도 복구 가능하므로(계정이 지워져도
    // 명부 행은 생존, 재초대로 복구) 구조를 만들지 않고 근거만 남긴다.
    // 나중에 보호가 필요해지면 이 기록이 백필 근거가 된다.
    // 자세한 배경: docs/shared-auth-openvote.md
    const invitedUserIds: string[] = [];

    for (let index = 0; index < pendingVoters.length; index += 5) {
      const batch = pendingVoters.slice(index, index + 5);
      const results = await Promise.allSettled(
        batch.map(async (voter) => {
          const { data: invited, error: inviteError } =
            await supabase.auth.admin.inviteUserByEmail(voter.email as string, {
              redirectTo,
            });
          if (inviteError) {
            throw inviteError;
          }
          await supabase
            .from("voter_registry")
            .update({ invited_at: new Date().toISOString() })
            .eq("id", voter.id);
          return invited?.user?.id ?? null;
        }),
      );

      sent += results.filter((result) => result.status === "fulfilled").length;
      failed += results.filter((result) => result.status === "rejected").length;

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          invitedUserIds.push(result.value);
        }
      }
    }

    await supabase.from("audit_logs").insert({
      event_type: "magic_links_sent",
      election_id: id,
      details: {
        sent,
        failed,
        actor: auth.user.user.id,
        sent_at: new Date().toISOString(),
        // 공유 auth.users 에 OpenVote 가 만든 계정. 위 주석 참조.
        invited_user_ids: invitedUserIds,
      },
    });

    return NextResponse.json({ sent, failed });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "매직 링크 발송에 실패했습니다.",
      500,
    );
  }
}
