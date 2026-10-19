import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceDbSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_GRANT = 100_000_000;

/**
 * 관리자 포인트 지급(충전 확인).
 * 계좌이체·현금 등으로 결제를 확인한 뒤 해당 사용자의 포인트 계정에 적립합니다.
 * 음수 금액(admin_adjust)으로 차감 조정도 가능합니다.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const amount = Number(body.amount);
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";

    if (!email) {
      return jsonError("지급 대상 이메일을 입력해주세요.", 400, "missing_email");
    }

    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_GRANT) {
      return jsonError(
        "지급 금액은 0이 아닌 정수(±1억 이내)여야 합니다.",
        400,
        "invalid_amount",
      );
    }

    const supabase = getServiceDbSupabase();

    // 실제 메일 주소는 auth.users에 없고 OpenVote 전용 회원 표에만 보관한다.
    // 다른 앱이 동일 이메일을 사용하더라도 그 계정에는 포인트를 지급하지 않는다.
    const { data: member, error: findError } = await supabase
      .from("members")
      .select("auth_user_id, role, email_verified")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (findError) {
      return jsonError("OpenVote 회원 조회 중 오류가 발생했습니다.", 500, findError.message);
    }

    if (!member || member.email_verified !== true || !["admin", "creator"].includes(member.role)) {
      return jsonError(
        "본인확인과 선거 생성 승인을 받은 OpenVote 회원만 포인트를 지급받을 수 있습니다.",
        404,
        "member_not_found",
      );
    }
    const userId = member.auth_user_id;

    const { data, error } = await supabase.rpc("adjust_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_tx_type: amount > 0 ? "charge" : "admin_adjust",
      p_memo: memo || `관리자 지급 (${auth.user.user.email ?? auth.user.user.id})`,
      p_actor: auth.user.user.id,
    });

    if (error) {
      return jsonError("포인트 지급 중 오류가 발생했습니다.", 500, error.message);
    }

    const result = data as
      | { success?: boolean; message?: string; error?: string; balance?: number }
      | null;

    if (!result?.success) {
      return jsonError(result?.message ?? "포인트 지급에 실패했습니다.", 400, result?.error);
    }

    await supabase.from("audit_logs").insert({
      event_type: "credits_granted",
      details: {
        target_user: userId,
        target_email: email,
        amount,
        balance_after: result.balance ?? null,
        actor: auth.user.user.id,
        granted_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, userId, balance: result.balance ?? 0 });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "포인트 지급 중 오류가 발생했습니다.",
      500,
    );
  }
}
