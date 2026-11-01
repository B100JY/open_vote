import { NextResponse } from "next/server";
import { auditBundle, loadAudit } from "@/lib/native-audit-server";
import { validReceiptWitness } from "@/lib/receipt-view-proof";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import type { AuditEvent, Signed } from "@/lib/native-audit";

export const dynamic = "force-dynamic";

/**
 * Access closed-election audit material with a previously signed receipt.
 * This is NOT a general viewer bypass: the witness must have been signed by
 * the election's real key and match the stored cast event exactly.
 * Only the PUBLIC witness is sent; no vote hash, password or selection.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { id } = await ctx.params;
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      return NextResponse.json({ message: "선거 정보가 올바르지 않습니다." }, { status: 400, headers });
    }
    if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
      return NextResponse.json({ message: "확인증 서명이 너무 큽니다." }, { status: 413, headers });
    }
    const raw = await request.text();
    if (raw.length > 8_192) return NextResponse.json({ message: "확인증 서명이 너무 큽니다." }, { status: 413, headers });
    const body = JSON.parse(raw) as { witness?: Signed<AuditEvent> };
    const witness = body?.witness;
    if (!witness || typeof witness !== "object" ||
      !witness.payload || typeof witness.signature !== "string" || typeof witness.keyId !== "string") {
      return NextResponse.json({ message: "유효한 접수 서명이 필요합니다." }, { status: 403, headers });
    }

    const audit = await loadAudit(id);
    if (!audit?.final_event) {
      return NextResponse.json({ message: "선거가 종료된 뒤에 검증할 수 있습니다." }, { status: 409, headers });
    }
    const index = witness.payload.index;
    if (!Number.isSafeInteger(index) || index < 1 || index > 100_000) {
      return NextResponse.json({ message: "유효한 접수 서명이 필요합니다." }, { status: 403, headers });
    }
    const { data, error } = await getServiceDbSupabase().from("audit_events")
      .select("event").eq("election_id", id).eq("index", index).maybeSingle();
    if (error || !data?.event ||
      !await validReceiptWitness(witness, audit.manifest, id, data.event as AuditEvent)) {
      return NextResponse.json({ message: "접수 서명이 공개 기록과 일치하지 않습니다." }, { status: 403, headers });
    }

    return NextResponse.json(await auditBundle(id), { headers });
  } catch {
    return NextResponse.json({ message: "검증 자료를 확인하지 못했습니다." }, { status: 503, headers });
  }
}
