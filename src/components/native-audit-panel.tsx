"use client";
import { useState } from "react";
import { Panel, Button, Alert } from "@/components/ui";
import { verifyBundle, type AuditBundle, type AuditCheck } from "@/lib/native-audit";
import { parseVerificationReceipt, isProtectedReceipt, type SavedReceipt, type VerificationReceipt } from "@/lib/vote-receipt";
import { downloadReceipt, downloadTextFile } from "@/lib/receipt-file";
import { fetchJson } from "@/lib/client-fetch";
import { unlockReceipt } from "@/lib/protected-receipt";

export function NativeAuditPanel({ electionId, simulatedBundle, simulatedReceipt }: { electionId: string; simulatedBundle?: AuditBundle; simulatedReceipt?: SavedReceipt }) {
  const [receipt,setReceipt]=useState<VerificationReceipt|null>(simulatedReceipt??null);
  const [checks,setChecks]=useState<AuditCheck[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [password,setPassword]=useState("");
  async function inspect() {
    setBusy(true);setError("");setChecks([]);
    try {
      // 암호를 먼저 확인한다. 잠금 해제 데이터는 저장하지 않고 이 검증 호출 안에서만 쓴다.
      let updated = receipt;
      let privateReceipt = updated && isProtectedReceipt(updated)
        ? await unlockReceipt(updated, password)
        : updated;
      const bundle=simulatedBundle??await fetchJson<AuditBundle>(`/api/elections/${electionId}/audit?bundle=1`);
      if (!simulatedBundle && updated?.audit && !updated.audit.witness) {
        const data=await fetchJson<{witness:NonNullable<SavedReceipt["audit"]>["witness"]}>(`/api/elections/${electionId}/audit?commitment=${updated.audit.commitment}`);
        if (data.witness) {
          updated={...updated,audit:{...updated.audit,witness:data.witness}} as VerificationReceipt;
          setReceipt(updated);
          if (privateReceipt?.audit) privateReceipt={...privateReceipt,audit:{...privateReceipt.audit,witness:data.witness}} as typeof privateReceipt;
        }
      }
      setChecks(await verifyBundle(bundle,privateReceipt??undefined));
      downloadTextFile(`모아이투표-${electionId}-공개검증.json`,JSON.stringify(bundle));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "검증 자료를 받지 못했습니다.");
    } finally{setBusy(false);}
  }
  return <Panel className="grid gap-4 p-5">
    <h2 className="text-lg font-semibold">서명 확인증과 공개 기록 검증</h2>
    {simulatedBundle ? <Alert tone="info">모의 선거용 임시 키의 서명을 확인합니다. 실제 서비스 서명·운영 원장의 진위를 검증하는 것은 아닙니다.</Alert> : null}
    <p className="text-sm leading-6 text-slate-600">개인 확인증은 브라우저에서만 읽습니다. 선택·비밀값을 서버로 보내지 않습니다. 공개 자료의 집계를 재계산하며, 모든 운영자 부정의 부재를 증명하지는 않습니다.</p>
    <label className="grid gap-2 text-sm">개인 확인증 파일 (선택)<input type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>1_000_000)throw Error();const r=parseVerificationReceipt(await f.text());if(!r?.audit||r.electionId!==electionId)throw Error();setReceipt(r);setPassword("");setChecks([]);setError("");}catch{setError("이 투표의 서명 확인증 JSON 파일인지 확인해주세요.");}}}/></label>
    {receipt && isProtectedReceipt(receipt) ? (
      <label className="grid gap-2 text-sm font-medium">영수증 보호 암호
        <input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}
          placeholder="저장할 때 정한 암호" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2" />
        <span className="text-xs font-normal text-slate-500">암호는 기기에서만 사용하며 서버에 보내지 않습니다. 잠금을 풀면 내 표의 내용까지 검증합니다.</span>
      </label>
    ) : null}
    <Button onClick={inspect} disabled={busy}>{busy?"검증 중":"공개 자료 받기·검증"}</Button>
    {error?<Alert>{error}</Alert>:null}
    <ul className="grid gap-2 text-sm" aria-live="polite">{checks.map((c,i)=><li key={i} className={c.status==="FAIL"?"text-red-700":c.status==="PASS"?"text-emerald-800":"text-slate-600"}>{c.status} · {c.check}<p>{c.detail}</p></li>)}</ul>
    {receipt?.audit && isProtectedReceipt(receipt) ? <Button variant="secondary" onClick={()=>downloadReceipt(receipt)}>암호화 영수증 다시 저장</Button> : null}
    <a className="text-sm text-blue-700 underline" href="/audit-verifier.html" download>인터넷 없이 사용할 검증기 저장</a>
    <p className="text-xs leading-6 text-slate-500">암호화 영수증을 열 때는 저장 당시 암호가 필요합니다. 내 표의 선택이 그대로 남아 있는지 확인할 수 있으며, 모든 운영상의 부정까지 증명하는 것은 아닙니다.</p>
  </Panel>;
}
