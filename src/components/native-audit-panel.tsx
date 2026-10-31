"use client";
import { useState } from "react";
import { Panel, Button, Alert } from "@/components/ui";
import { verifyBundle, type AuditBundle, type AuditCheck } from "@/lib/native-audit";
import { parseSavedReceipt, type SavedReceipt } from "@/lib/vote-receipt";
import { downloadReceipt, downloadTextFile } from "@/lib/receipt-file";
import { fetchJson } from "@/lib/client-fetch";

export function NativeAuditPanel({ electionId, simulatedBundle, simulatedReceipt }: { electionId: string; simulatedBundle?: AuditBundle; simulatedReceipt?: SavedReceipt }) {
  const [receipt,setReceipt]=useState<SavedReceipt|null>(simulatedReceipt??null);
  const [checks,setChecks]=useState<AuditCheck[]>([]);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function inspect() {
    setBusy(true);setError("");
    try {
      const bundle=simulatedBundle??await fetchJson<AuditBundle>(`/api/elections/${electionId}/audit?bundle=1`);
      let updated=receipt;
      if (!simulatedBundle && receipt?.audit && !receipt.audit.witness) {
        const data=await fetchJson<{witness:NonNullable<SavedReceipt["audit"]>["witness"]}>(`/api/elections/${electionId}/audit?commitment=${receipt.audit.commitment}`);
        updated={...receipt,audit:{...receipt.audit,witness:data.witness}};setReceipt(updated);
      }
      setChecks(await verifyBundle(bundle,updated??undefined));
      downloadTextFile(`모아이투표-${electionId}-공개검증.json`,JSON.stringify(bundle));
    } catch {setError("자료를 받지 못했습니다. 검증 성공이나 조작 확정으로 처리하지 않습니다.");}
    finally{setBusy(false);}
  }
  return <Panel className="grid gap-4 p-5">
    <h2 className="text-lg font-semibold">서명 확인증과 공개 기록 검증</h2>
    {simulatedBundle ? <Alert tone="info">모의 선거용 임시 키의 서명을 확인합니다. 실제 서비스 서명·운영 원장의 진위를 검증하는 것은 아닙니다.</Alert> : null}
    <p className="text-sm leading-6 text-slate-600">개인 확인증은 브라우저에서만 읽습니다. 선택·비밀값을 서버로 보내지 않습니다. 공개 자료의 집계를 재계산하며, 모든 운영자 부정의 부재를 증명하지는 않습니다.</p>
    <label className="grid gap-2 text-sm">개인 확인증 파일 (선택)<input type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>1_000_000)throw Error();const r=parseSavedReceipt(await f.text());if(!r?.audit||r.electionId!==electionId)throw Error();setReceipt(r);setChecks([]);setError("");}catch{setError("이 투표의 서명 확인증 JSON 파일인지 확인해주세요.");}}}/></label>
    <Button onClick={inspect} disabled={busy}>{busy?"검증 중":"공개 자료 받기·검증"}</Button>
    {error?<Alert>{error}</Alert>:null}
    <ul className="grid gap-2 text-sm" aria-live="polite">{checks.map((c,i)=><li key={i} className={c.status==="FAIL"?"text-red-700":c.status==="PASS"?"text-emerald-800":"text-slate-600"}>{c.status} · {c.check}<p>{c.detail}</p></li>)}</ul>
    {receipt?.audit?.witness?<Button variant="secondary" onClick={()=>downloadReceipt(receipt)}>서명을 담은 확인증 저장</Button>:null}
    <a className="text-sm text-blue-700 underline" href="/audit-verifier.html" download>인터넷 없이 사용할 검증기 저장</a>
    <p className="text-xs leading-6 text-slate-500">확인증과 공개 검증 자료·검증기 파일을 따로 보관하세요. 외부에서 받은 시작 규칙 사본의 비교는 오프라인 검증기에서 할 수 있습니다.</p>
  </Panel>;
}
