import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";

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

    const supabase = getServiceSupabase();

    const { data: userId, error: findError } = await supabase.rpc(
      "find_user_id_by_email",
      { p_email: email },
    );

    if (findError) {
      return jsonError("사용자 조회 중 오류가 발생했습니다.", 500, findError.message);
    }

    if (!userId) {
      return jsonError(
        "해당 이메일의 사용자를 찾을 수 없습니다. 먼저 로그인(가입)한 사용자만 지급할 수 있습니다.",
        404,
        "user_not_found",
      );
    }

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
