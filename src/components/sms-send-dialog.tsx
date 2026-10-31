"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { authHeaders } from "@/lib/client-auth";
import { checkCompactTitle, compactMessage, smsBytes, type SmsFormat } from "@/lib/sms-format";
import { checkSmsTitle, defaultSmsTitle } from "@/lib/sms-title";
import type { Election } from "@/lib/types";

type Quote = { count: number; balance: number; standard: number; compact: number; legacyCredit: number; prices: { standard: number; compact: number } };
type Result = { sent?: number; failed?: number; skipped?: number; stopped?: string | null; cost?: number; refunded?: number; resendCount?: number | null; message?: string; uncertain?: boolean };
export function SmsSendDialog({ election, resendAll = false, voterId, startBeforeSend = false, onStarted, onClose, onSent }: { election: Election; resendAll?: boolean; voterId?: string; startBeforeSend?: boolean; onStarted?: () => void; onClose: () => void; onSent: (result: Result) => void }) {
  const [format, setFormat] = useState<SmsFormat>("standard");
  const [title, setTitle] = useState(election.sms_title || election.name);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(!startBeforeSend || election.status !== "draft");
  const dialog = useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input[type="text"],input:not([type])')?.focus();
    return ()=>previous?.focus();
  },[]);
  useEffect(()=>{
    const keydown = (event: KeyboardEvent)=>{
      if(event.key==="Escape" && !sending){event.preventDefault();onClose();}
      if(event.key!=="Tab")return;
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')??[]);
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",keydown);return ()=>document.removeEventListener("keydown",keydown);
  },[onClose,sending]);
  useEffect(() => {
    let cancelled = false;
    const query = voterId ? `?voterId=${encodeURIComponent(voterId)}` : `?resendAll=${resendAll ? 1 : 0}`;
    void authHeaders().then(headers => fetchJson<Quote>(`/api/elections/${election.id}/participants/sms-invite${query}`,{headers})).then(data => { if (!cancelled) setQuote(data); }).catch(() => { if (!cancelled) setError("발송비를 불러오지 못했습니다. 창을 닫고 다시 열어주세요."); });
    return () => { cancelled = true; };
  }, [election.id,resendAll,voterId]);
  const check = format === "compact" ? checkCompactTitle(title) : checkSmsTitle(title);
  const previewTitle = check.ok ? check.value || defaultSmsTitle(election.name) : title;
  const preview = format === "compact" ? compactMessage(previewTitle) : `[모아이투표] ${previewTitle}\n\n유권자님 투표 링크: https://vote.bluerdot.net/v/개인링크\n\n또는 https://vote.bluerdot.net 에서 아래 코드 입력 후 투표하실 수도 있습니다.\n\n투표 코드: ABC-012`;
  const required = quote?.[format] ?? 0, insufficient = !!quote && required > quote.balance;
  async function ensureStarted() {
    if (started) return;
    await fetchJson(`/api/elections/${election.id}`, {method:"PATCH",headers:await authHeaders(),body:JSON.stringify({status:"active"})});
    setStarted(true);
    onStarted?.();
  }
  async function startOnly() {
    if (sending) return;
    setSending(true); setError("");
    try { await ensureStarted(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "투표를 시작하지 못했습니다."); }
    finally { setSending(false); }
  }
  async function send() {
    if (!quote || !check.ok || insufficient || sending || finished) return;
    setSending(true); setError("");
    let activationComplete = started;
    try {
      await ensureStarted();
      activationComplete = true;
      const path = voterId ? `/api/elections/${election.id}/participants/${voterId}/resend` : `/api/elections/${election.id}/participants/sms-invite`;
      const result = await fetchJson<Result>(path,{method:"POST",headers:await authHeaders(),body:JSON.stringify({format,smsTitle:title,resendAll})});
      setFinished(true);
      if (result.stopped || result.uncertain) { setError(result.stopped || "발송 상태를 확인해주세요."); return; }
      if ((result.failed ?? 0)+(result.skipped ?? 0)>0) {setError(`${result.sent ?? 0}건 발송, ${(result.failed ?? 0)+(result.skipped ?? 0)}건 실패·건너뜀. 사용 ${result.cost ?? 0}P, 반환 ${result.refunded ?? 0}P입니다. 실패 대상은 발송 목록에서 확인해주세요.`);return;}
      onSent(result); onClose();
    } catch (e) { setError(`${startBeforeSend && activationComplete ? "투표는 시작됐지만 문자 발송을 완료하지 못했습니다. " : ""}${e instanceof Error ? e.message : "발송하지 못했습니다."}`); }
    finally { setSending(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => { if (!sending) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sms-dialog-title" className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e=>e.stopPropagation()}>
      <h2 id="sms-dialog-title" className="text-xl font-bold">{startBeforeSend && !started ? "투표 시작 · 문자 미리보기" : resendAll || voterId ? "투표 문자 재발송" : "투표 안내 문자 발송"}</h2>
      {startBeforeSend && !started ? <p className="mt-2 text-sm text-slate-600">문자 형식과 내용을 확인한 뒤 시작하세요. 문자 없이 시작하고 나중에 발송할 수도 있습니다.</p> : null}
      <div className="my-4 grid grid-cols-2 gap-2">
        {(["compact","standard"] as const).map(f => <label key={f} className={`cursor-pointer rounded-xl border p-3 ${format===f ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="sms-format" checked={format===f} disabled={sending||finished} onChange={()=>setFormat(f)}/><span className="ml-2 font-semibold">{f==="compact" ? "단문 SMS" : "장문 LMS"}</span><span className="mt-1 block text-sm text-slate-600">{quote ? `${quote.prices[f]}원 / 명` : "요금 조회 중"}</span></label>)}
      </div>
      {format==="compact" ? <p className="mb-3 text-sm text-slate-600">투표 방법을 미리 공지한 경우에 사용하세요. 개인 링크 없이 사이트 주소와 코드만 보냅니다.</p> : null}
      <label className="block text-sm font-semibold">투표 제목<input value={title} maxLength={format==="compact"?36:30} disabled={sending||finished} onChange={e=>setTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"/></label>
      {format==="compact" ? <p className={`mt-1 text-sm ${check.ok ? "text-slate-500" : "text-red-600"}`}>제목 {smsBytes(previewTitle) ?? "지원 불가"}/36바이트 · 한글 최대 18자(영문·숫자 최대 36자)<br/>문자 전체 {smsBytes(preview) ?? "지원 불가"}/90바이트 · 초과하면 발송할 수 없습니다.</p> : <p className="mt-1 text-sm text-slate-500">제목 최대 30자</p>}
      {!check.ok ? <p role="alert" className="mt-2 text-sm text-red-600">{check.message}</p> : null}
      <pre className="my-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm leading-relaxed">{preview}</pre>
      <p className="mb-3 text-xs text-slate-500">수신자 이름·개인 링크·코드는 예시이며, 실제 발송 시 각 유권자의 정보로 바뀝니다.</p>
      {quote ? <div className="mb-4 text-sm leading-6 text-slate-600"><p>대상 {quote.count}명 · 예상 발송비 {(quote.count*quote.prices[format]).toLocaleString()}P (1P=1원)</p><p>현재 잔액 {quote.balance.toLocaleString()}P · 지금 예약할 금액 {required.toLocaleString()}P</p>{quote.legacyCredit>0?<p>기존 선차감액 {quote.legacyCredit}P를 먼저 사용하고, 남는 차액은 발송 성공 후 반환합니다.</p>:null}<p>전체 비용을 먼저 예약하고 발송 실패분은 반환합니다. 재발송하면 이전 링크·코드는 무효화됩니다.</p></div> : null}
      {insufficient ? <Alert>포인트가 부족합니다. <Link className="underline" href="/credits">포인트 충전 안내</Link>에서 충전 후 다시 열어주세요.</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={sending} onClick={onClose}>닫기</Button>{startBeforeSend && !started ? <Button variant="secondary" disabled={sending} onClick={startOnly}>문자 없이 시작</Button> : null}<Button disabled={!quote||!quote.count||!check.ok||insufficient||sending||finished} onClick={send}>{sending ? "처리 중" : startBeforeSend && !started ? `시작하고 문자 발송 · ${required.toLocaleString()}P` : `${required.toLocaleString()}P 예약 후 발송`}</Button></div>
    </section>
  </div>;
}
