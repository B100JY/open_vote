import { verifyBundle, type AuditBundle, type AuditAnchor } from "./native-audit.ts";
import { isProtectedReceipt, parseVerificationReceipt } from "./vote-receipt.ts";
import { unlockReceipt } from "./protected-receipt.ts";
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
async function read(id: string, max: number) {
  const file=input(id).files?.[0]; if(!file)return undefined;
  if(file.size>max)throw new Error("파일이 너무 큽니다.");
  return await file.text();
}
document.getElementById("verify")!.addEventListener("click",async()=>{
  const out=document.getElementById("result")!;
  out.textContent="검증 중";
  try{
    const bundle=await read("bundle",64_000_000), rawReceipt=await read("receipt",1_000_000), rawAnchor=await read("anchor",1_000_000);
    if(!bundle)throw new Error("공개 검증 파일을 선택해주세요.");
    const fileReceipt=rawReceipt?parseVerificationReceipt(rawReceipt):undefined;
    if(rawReceipt&&!fileReceipt)throw new Error("개인 확인증 형식을 확인해주세요.");
    const receipt=fileReceipt&&isProtectedReceipt(fileReceipt)
      ? await unlockReceipt(fileReceipt,input("password").value)
      : fileReceipt;
    const anchor=rawAnchor?JSON.parse(rawAnchor) as AuditAnchor:undefined;
    const checks=await verifyBundle(JSON.parse(bundle) as AuditBundle,receipt??undefined,anchor);
    out.textContent=checks.map(c=>`${c.status} · ${c.check}\n${c.detail}`).join("\n\n");
  }catch(e){out.textContent=e instanceof Error?e.message:"검증 자료를 읽지 못했습니다.";}
});
