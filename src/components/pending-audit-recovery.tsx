"use client";
import { useEffect, useState } from "react";
import { parseSavedReceipt, RECEIPT_STORAGE_KEY, type SavedReceipt } from "@/lib/vote-receipt";
import { commitment, eventHead, hashObject, verifySignature, type Signed, type AuditEvent } from "@/lib/native-audit";
import { fetchJson } from "@/lib/client-fetch";
import { downloadReceipt } from "@/lib/receipt-file";
import { Button } from "@/components/ui";

/** 본인 조회 표를 만들지 않고 이 탭에 남은 로컬 비밀과 공개 이벤트만으로 복구한다. */
export function PendingAuditRecovery({electionId}:{electionId:string}) {
  const [receipt,setReceipt]=useState<SavedReceipt|null>(null),[message,setMessage]=useState("");
  useEffect(()=>{let alive=true;Promise.resolve().then(()=>{try{const r=parseSavedReceipt(sessionStorage.getItem(`moai_pending_${electionId}`));if(alive&&r?.audit&&r.electionId===electionId)setReceipt(r);}catch{}});return()=>{alive=false;};},[electionId]);
  if(!receipt?.audit)return null;
  async function recover(){
    try{
      const a=receipt!.audit!;
      const c=await commitment(electionId,await hashObject(a.manifest.payload),receipt!.receiptHash,a.secret);
      if(c!==a.commitment)throw Error("로컬 확인증이 올바르지 않습니다.");
      const {witness}=await fetchJson<{witness:Signed<AuditEvent>|null}>(`/api/elections/${electionId}/audit?commitment=${c}`);
      if(!witness||!await verifySignature(witness,a.manifest.payload)||witness.payload.electionId!==electionId||witness.payload.manifestHash!==await hashObject(a.manifest.payload)||witness.payload.kind!=="vote"||witness.payload.payload.commitment!==c||witness.payload.head!==await eventHead(witness.payload))throw Error("접수 서명이 아직 준비되지 않았습니다. 나중에 다시 시도해주세요.");
      const ready={...receipt!,audit:{...a,witness}};
      sessionStorage.setItem(RECEIPT_STORAGE_KEY,JSON.stringify(ready));
      downloadReceipt(ready);setMessage("접수 서명을 확인했습니다. 저장한 파일은 본인만 보관하세요.");
    }catch(e){setMessage(e instanceof Error?e.message:"확인증을 준비하지 못했습니다.");}
  }
  return <div className="mt-4 grid gap-2"><Button variant="secondary" onClick={recover}>접수 확인증 이어받기</Button>{message?<p className="text-sm" role="status">{message}</p>:null}</div>;
}
