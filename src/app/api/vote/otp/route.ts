import { NextResponse } from "next/server";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { resolveVoteCredential } from "@/lib/vote-credential";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { getNotifierConfig, sendNotifierBatch } from "@/lib/simply-notifier";
import { getClientIp } from "@/lib/api-response";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    if ((await checkRateLimit(ip,"precast_otp")).blocked) return NextResponse.json({ message: "요청이 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
    const body = await request.json();
    const r = await resolveVoteCredential(request,body);
    if (!r || r.has_voted) { await recordFailedAttempt(ip,"precast_otp"); return NextResponse.json({ message: "투표 자격을 확인해주세요." }, { status: 403 }); }
    const db = getServiceDbSupabase();
    if (body.action === "verify") {
      if (!/^[0-9]{6}$/.test(body.otp ?? "") || !/^[a-f0-9-]{36}$/.test(body.challenge ?? "")) return NextResponse.json({ message: "인증번호를 확인해주세요." }, { status: 400 });
      const grant = typeof body.grant === "string" && /^[a-f0-9]{64}$/.test(body.grant) ? body.grant : null;
      if (!grant) return NextResponse.json({message:"승인 형식 오류"},{status:400});
      const { data, error } = await db.rpc("audit_otp_confirm", { p_registry_id:r.id,p_challenge:body.challenge,p_code_hash:hash(`${body.challenge}:${body.otp}`),p_grant_hash:hash(grant) });
      if (error || data !== true) { await recordFailedAttempt(ip,"precast_otp"); return NextResponse.json({ message: "인증번호가 다르거나 만료되었습니다." }, { status: 403 }); }
      return NextResponse.json({ grant }, { headers:{ "Cache-Control":"no-store" } });
    }
    if (body.action !== "request") return NextResponse.json({ message: "요청 형식 오류" },{status:400});
    // 명시적 운영 설정 없이는 유료 발송하지 않는다. 시험에서는 제공자를 모의 처리한다.
    const config = getNotifierConfig(), template = process.env.MOAI_OTP_TEMPLATE;
    if (!config || !template || process.env.MOAI_OTP_SEND_ENABLED !== "true") return NextResponse.json({ message: "문자 인증 발송을 사용할 수 없습니다. 관리자에게 문의해주세요." }, { status:503 });
    const otp = String(randomInt(0,1_000_000)).padStart(6,"0"), challenge=randomUUID();
    const { data, error } = await db.rpc("audit_otp_issue", { p_registry_id:r.id,p_challenge:challenge,p_code_hash:hash(`${challenge}:${otp}`),p_price:1 });
    if (error || !data?.ok) return NextResponse.json({ message: "발송 대기 시간·횟수·잔액을 확인해주세요." },{status:429});
    // 미리 등록된 코드 전용 템플릿을 사용한다. 선거 이름·비밀 투표 자격은 보내지 않는다.
    const result=await sendNotifierBatch({...config,template},{recipients:[{phone:data.phone,variables:{code:otp}}],idempotencyKey:`moai-otp-${challenge}`});
    const {error: readyError}=await db.rpc("audit_otp_settle",{p_challenge:challenge,p_sent:result.sent===1});
    if (result.sent !== 1) return NextResponse.json({ message: "문자 발송에 실패했습니다. 자동 재발송하지 않습니다." },{status:503});
    if (readyError) return NextResponse.json({ message:"인증 준비를 마치지 못했습니다." },{status:503});
    return NextResponse.json({challenge,expiresIn:300,retryAfter:60},{headers:{"Cache-Control":"no-store"}});
  } catch { return NextResponse.json({ message:"문자 인증을 처리하지 못했습니다. 자동 재발송하지 않습니다." },{status:503}); }
}
