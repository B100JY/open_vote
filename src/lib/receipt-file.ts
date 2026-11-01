import { auditReceiptEvidence } from "./receipt-audit.ts";
import { receiptLabel, toPrivacyReceipt, isPrivacyReceipt, isProtectedReceipt, type VerificationReceipt, type SavedReceipt } from "./vote-receipt.ts";

/** 파일 내용·개인 영수증은 URL, API, 분석 로그로 전송하지 않는다. */
export function downloadTextFile(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createReceiptHtml(receipt: SavedReceipt) {
  const data = JSON.stringify(receipt).replaceAll("<", "\\u003c");
  const label = receiptLabel(receipt);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>모아이투표 검증 영수증</title>
<style>body{font:16px/1.8 system-ui,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:24px}main{max-width:600px;margin:32px auto;background:white;border:1px solid #dbe3ef;border-radius:20px;padding:28px}h1{font-size:24px}h2{font-size:18px}code{font-size:22px;color:#2456d8}input,button{font:inherit;margin-top:16px;max-width:100%}button{border:0;border-radius:10px;padding:12px 18px;color:white;background:#315bea;cursor:pointer}p{overflow-wrap:anywhere}.muted{font-size:14px;color:#64748b}[role=status]{padding:12px;background:#eef3ff;border-radius:10px}</style></head>
<body><main><h1>모아이투표 검증 영수증</h1><p id="election"></p><code>${label}</code>
<p>이 파일이 원본 영수증입니다. 짧은 번호만으로는 복구할 수 없으니 파일을 본인만 보관해주세요.</p>
<h2>마감 후 내 표 확인</h2><p>모아이투표의 ‘투표 검증’에서 받은 <strong>투표 기록 파일</strong>을 선택하세요. 검사는 이 파일 안에서만 진행되며 인터넷으로 보내지 않습니다.</p>
<label>투표 기록 파일 <input id="record" type="file" accept="application/json,.json"></label>
<p id="status" role="status">기록 파일을 선택하면 확인 결과가 나옵니다.</p>
<button id="save" hidden>마감 기록을 담은 영수증 저장</button>
<p class="muted">최초 확인에서는 내 표와 투표 항목을 검증합니다. 마감 기록까지 담아 다시 저장하면 이후 다른 표의 변경도 비교할 수 있습니다. 처음 저장하기 전의 전체 기록이나 모든 유권자에게 같은 기록을 보여줬는지까지 보장하지는 않습니다.</p>
<p class="muted">파일을 공유하면 내 선택 내용이 드러날 수 있습니다. 원본 파일을 수정하면 비교의 기준도 달라집니다.</p>
</main><script id="moai-receipt" type="application/json">${data}</script>
<script>
"use strict";
const receipt=JSON.parse(document.getElementById("moai-receipt").textContent);
document.getElementById("election").textContent=receipt.electionName||"투표 영수증";
const audit=(${auditReceiptEvidence.toString()});
let checked=null;
document.getElementById("record").addEventListener("change",async(event)=>{
 const status=document.getElementById("status"); const save=document.getElementById("save"); save.hidden=true; checked=null;
 const file=event.target.files[0]; if(!file)return;
 status.textContent="기록을 확인하고 있습니다.";
 try{if(file.size>32000000)throw Error("기록 파일은 32MB 이하여야 합니다.");
 const result=await audit(receipt,JSON.parse(await file.text()));
 status.textContent=result.message;
 if(result.valid&&!receipt.checkpoint){checked=result;save.hidden=false;}
 }catch{status.textContent="기록 파일을 읽지 못했습니다. 모아이투표에서 받은 JSON 파일인지 확인해주세요.";}
});
document.getElementById("save").addEventListener("click",()=>{
 if(!checked)return;
 const updated={...receipt,checkpoint:{ledgerHash:checked.ledgerHash,contextHash:checked.contextHash,ballotCount:checked.ballotCount}};
 const copy=document.documentElement.cloneNode(true);
 copy.querySelector("#moai-receipt").textContent=JSON.stringify(updated).replaceAll("<","\\u003c");
 copy.querySelector("#save").hidden=true;
 copy.querySelector("#status").textContent="마감 기록을 보관했습니다. 기록 파일을 선택해 다시 비교할 수 있습니다.";
 const url=URL.createObjectURL(new Blob(["<!doctype html>"+copy.outerHTML],{type:"text/html;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download="모아이투표-${label}-마감영수증.html";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
</script></body></html>`;
}

export function downloadReceipt(receipt: VerificationReceipt) {
  if (isProtectedReceipt(receipt)) {
    downloadTextFile(`모아이투표-${receipt.audit.commitment.slice(0, 8)}-암호화영수증.json`, JSON.stringify(receipt));
    return;
  }
  if (isPrivacyReceipt(receipt)) {
    downloadTextFile(`모아이투표-${receipt.audit.commitment.slice(0, 8)}-접수확인증.json`, JSON.stringify(receipt));
    return;
  }
  if (receipt.audit) {
    const safe = toPrivacyReceipt(receipt);
    downloadTextFile(`모아이투표-${safe.audit.commitment.slice(0, 8)}-접수확인증.json`, JSON.stringify(safe));
    return;
  }
  // 기존 방식은 평문 공개 원장과 receiptHash가 연결되어 있어 안전한 확인증을 만들 수 없다.
  // 이 경로에서 비밀투표를 누설할 수 있는 파일을 저장하지 않는다.
  throw new Error("이전 방식 영수증은 선택 정보가 유추될 수 있어 파일로 저장하지 않습니다.");
}
