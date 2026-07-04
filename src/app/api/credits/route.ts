import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-response";
import { requireVoteCreator } from "@/lib/supabase/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getCreditPerVoter } from "@/lib/billing";

export const dynamic = "force-dynamic";

/** 로그인한 투표 생성자의 포인트 잔액과 최근 거래 내역 */
export async function GET(request: Request) {
  try {
    const auth = await requireVoteCreator(request);
    if (!auth.ok) {
      return jsonError(auth.message, auth.status, auth.error);
    }

    const userId = auth.user.user.id;
    const supabase = getServiceSupabase();

    const [{ data: account }, { data: transactions, error: txError }] =
      await Promise.all([
        supabase
          .from("credit_accounts")
          .select("balance, updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("credit_transactions")
          .select("id, amount, balance_after, tx_type, election_id, memo, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (txError) {
      return jsonError("포인트 내역을 불러오지 못했습니다.", 500, txError.message);
    }

    return NextResponse.json({
      balance: account?.balance ?? 0,
      unitPrice: getCreditPerVoter(),
      isAdmin: auth.isAdmin,
      transactions: transactions ?? [],
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "포인트 정보를 불러오지 못했습니다.",
      500,
    );
  }
}
