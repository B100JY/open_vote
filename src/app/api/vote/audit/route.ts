import { NextResponse } from "next/server";
import { resolveVoteCredential } from "@/lib/vote-credential";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { publicAudit } from "@/lib/native-audit-server";
import { HEX } from "@/lib/native-audit";
import { getClientIp } from "@/lib/api-response";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if ((await checkRateLimit(ip,"audit_vote")).blocked) return NextResponse.json({ message: "잠시 후 다시 시도해주세요." }, { status: 429 });
    const body = await request.json();
    const r = await resolveVoteCredential(request, body);
    if (!r) { await recordFailedAttempt(ip,"audit_vote"); return NextResponse.json({ message: "투표 자격을 확인해주세요." }, { status: 403 }); }
    if (!HEX.test(body.commitment ?? "") || !HEX.test(body.manifestHash ?? "") || !HEX.test(body.receiptHash ?? "")) return NextResponse.json({ message: "확인증 형식 오류" }, { status: 400 });
    const { data, error } = await getServiceDbSupabase().rpc("audit_cast", { p_registry_id: r.id, p_selection: body.selection, p_receipt_hash: body.receiptHash, p_commitment: body.commitment, p_manifest_hash: body.manifestHash, p_grant_hash: typeof body.grant === "string" ? (await import("node:crypto")).createHash("sha256").update(body.grant).digest("hex") : null });
    if (error) return NextResponse.json({ message: "접수 상태를 확인하지 못했습니다. 저장된 확인증으로 조회해주세요." }, { status: 503 });
    if (!data.success && data.error !== "public_event_exists") return NextResponse.json({ message: data.message ?? (data.error === "sms_auth_required" ? "제출 전 문자 인증이 필요합니다." : "접수할 수 없습니다. 참여 여부와 기간을 확인해주세요."), error: data.error }, { status: 409 });
    scheduleNotifications();
    // 공개 c의 존재는 본인 소유 증명이 아니다. 응답에도 신규 접수와 구분한다.
    let witness;
    try { witness = await publicAudit(r.election_id, body.commitment); } catch { /* 접수 성공과 서명 대기는 구분한다. */ }
    return NextResponse.json({ success: data.success === true, existingPublicEvent: data.error === "public_event_exists", receiptHash: body.receiptHash, audit: witness ?? null });
  } catch { return NextResponse.json({ message: "요청을 처리하지 못했습니다." }, { status: 503 }); }
}
import { scheduleNotifications } from "@/lib/admin-notifications";
