import { validReceiptWitness } from "../receipt-view-proof.ts";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { protectReceipt, unlockReceipt } from "../protected-receipt.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { appendMockNativeVote, createMockNativeState, makeMockAuditBundle } from "../mock-native-audit.ts";
import { mockElectionResults } from "../mock-election.ts";
import { verifyBundle } from "../native-audit.ts";
import { createVoteReceipt, computeLedgerHash } from "../verification.ts";
import { electionContextHash } from "../receipt-audit.ts";
import type { Election } from "../types.ts";
import { formatReceiptForCopy, parseVerificationReceipt, toPrivacyReceipt, type SavedReceipt } from "../vote-receipt.ts";

const election: Election = {
  id:"00000000-0000-4000-8000-000000000009", name:"서명 시험", description:"모의",
  candidates:[{id:"a",name:"찬성"},{id:"b",name:"반대"}],
  ballot_type:"single", min_choices:1,max_choices:1,allow_blank:true,
  status:"closed", audit_version:1,total_voter_codes:0,starts_at:"2026-11-01T00:00:00.000Z",ends_at:"2026-11-02T00:00:00.000Z",
  created_at:"2026-11-01T00:00:00.000Z",updated_at:"2026-11-01T00:00:00.000Z",
};

test("모의 임시키 서명 확인증·영수증·원장·집계를 실제 검증기로 검사",async () => {
  const start = await createMockNativeState(election);
  const ballot = await createVoteReceipt({electionId:election.id,selection:"a"});
  const receipt:SavedReceipt = { electionId:election.id,electionName:election.name,...ballot,contextHash:await electionContextHash(election) };
  const next = await appendMockNativeVote(start,receipt);
  const rows = [{receipt_hash:receipt.receiptHash,selection:"a"}];
  const ledger={election_id:election.id,ballot_count:1,ledger_hash:await computeLedgerHash(rows),ballots:rows};
  const bundle=await makeMockAuditBundle(next.state,ledger,mockElectionResults(election,rows));
  const checks=await verifyBundle(bundle,next.receipt);
  assert.deepEqual(checks.filter(c=>c.status==="FAIL"),[]);
  for(const id of ["MANIFEST_SIGNATURE","FINAL_SIGNATURE","HISTORY_AND_LEDGER","TALLY_RECOUNT","OWN_COMMITMENT","OWN_BALLOT","OWN_WITNESS"]){
    assert.equal(checks.find(c=>c.check===id)?.status,"PASS",id);
  }
  // 임시 서명을 보존하더라도 표가 변조되면 원본 공개 자료와 대조 실패
  const altered = structuredClone(bundle);
  altered.ledger.ballots[0].selection="b";
  const bad=await verifyBundle(altered,next.receipt);
  assert(bad.some(c=>c.status==="FAIL"));
});

test("유출된 새 확인증 파일만으로 공개 원장의 선택을 추적할 수 없고 접수 서명을 검증한다", async () => {
  const start = await createMockNativeState(election);
  const ballot = await createVoteReceipt({electionId:election.id,selection:"b"});
  const receipt: SavedReceipt = {electionId:election.id,electionName:election.name,...ballot,contextHash:await electionContextHash(election)};
  const next = await appendMockNativeVote(start,receipt);
  const ballots = [{receipt_hash:receipt.receiptHash,selection:"b"}];
  const ledger={election_id:election.id,ballot_count:1,ledger_hash:await computeLedgerHash(ballots),ballots};
  const bundle=await makeMockAuditBundle(next.state,ledger,mockElectionResults(election,ballots));
  const safe=toPrivacyReceipt(next.receipt);
  const json=JSON.stringify(safe);
  for(const forbidden of [receipt.receiptHash,receipt.salt,next.receipt.audit!.secret,'"selection"', '"receiptHash"', '"salt"', '"secret"']) {
    assert.ok(!json.includes(forbidden), "확인증에 선택을 추적할 수 있는 값이 없어야 함");
  }
  assert.equal(formatReceiptForCopy(next.receipt),json);
  const polluted=structuredClone(next.receipt);
  const unexpected="NOT-FOR-EXPORT-MOCK-SECRET";
  (polluted.audit!.manifest.payload.publicKey as JsonWebKey).d=unexpected;
  (polluted.audit!.witness!.payload.payload as Record<string,string>).selection=unexpected;
  const filtered=JSON.stringify(toPrivacyReceipt(polluted));
  assert.equal(filtered.includes(unexpected),false,"서명 객체의 예상하지 못한 필드도 내보내지 않아야 함");
  assert.equal((await verifyBundle(bundle,toPrivacyReceipt(polluted))).some(c=>c.status==="FAIL"),false);

  const parsed=parseVerificationReceipt(json);
  assert.deepEqual(parsed,safe);
  assert(parsed);
  const checks=await verifyBundle(bundle,parsed);
  for(const name of ["OWN_COMMITMENT","OWN_WITNESS","HISTORY_AND_LEDGER","TALLY_RECOUNT"]) {
    assert.equal(checks.find(c=>c.check===name)?.status,"PASS",name);
  }
  assert.equal(checks.find(c=>c.check==="OWN_BALLOT")?.status,"UNCONFIRMED");
  assert.equal(checks.some(c=>c.status==="FAIL"),false);
  const manipulated={...safe,audit:{...safe.audit,commitment:"0".repeat(64)}};
  assert.equal(parseVerificationReceipt(JSON.stringify(manipulated)),null);
  assert.equal((await verifyBundle(bundle,manipulated)).find(c=>c.check==="OWN_WITNESS")?.status,"FAIL");
});

test("비밀번호로 잠근 영수증은 공개 JSON에서 선택 해시가 보이지 않으면서 내 표 검증까지 통과", async () => {
  const start = await createMockNativeState(election);
  const vote = await createVoteReceipt({electionId:election.id,selection:"a"});
  const receipt:SavedReceipt = {
    electionId:election.id,electionName:election.name,...vote,contextHash:await electionContextHash(election),
  };
  const next=await appendMockNativeVote(start,receipt);
  const ballots=[{receipt_hash:receipt.receiptHash,selection:"a"}];
  const ledger={election_id:election.id,ballot_count:1,ledger_hash:await computeLedgerHash(ballots),ballots};
  const bundle=await makeMockAuditBundle(next.state,ledger,mockElectionResults(election,ballots));
  const password="private verification passphrase 321";
  const locked=await protectReceipt(next.receipt,password);
  const raw=JSON.stringify(locked);
  for (const sensitive of [receipt.receiptHash,receipt.salt,next.receipt.audit!.secret,'"receiptHash"','"selection"','"secret"']) {
    assert.equal(raw.includes(sensitive),false,"다운로드 파일에 공개원장 연결 정보를 평문으로 담지 않아야 함");
  }
  const parsed=parseVerificationReceipt(raw);
  assert.deepEqual(parsed,locked);
  assert(parsed && "encrypted" in parsed);
  const unlocked=await unlockReceipt(parsed,password);
  assert.deepEqual(unlocked,next.receipt);
  const checks=await verifyBundle(bundle,unlocked);
  for(const name of ["OWN_COMMITMENT","OWN_BALLOT","OWN_WITNESS","HISTORY_AND_LEDGER","TALLY_RECOUNT"]) {
    assert.equal(checks.find(c=>c.check===name)?.status,"PASS",name);
  }
  assert.rejects(()=>unlockReceipt(parsed,"wrong password"));
  const changed=structuredClone(parsed);
  // Base64URL 마지막 글자의 사용하지 않는 비트를 바꾸면 실제 암호문이 같을 수 있다.
  // 첫 글자를 변경해야 AES-GCM 위변조 검증을 확실하게 테스트할 수 있다.
  changed.encrypted.data=(changed.encrypted.data.startsWith("A")?"B":"A")+changed.encrypted.data.slice(1);
  await assert.rejects(()=>unlockReceipt(changed,password));
  const swapped=structuredClone(parsed);
  swapped.audit.commitment="0".repeat(64);
  await assert.rejects(()=>unlockReceipt(swapped,password));
  assert.equal(parseVerificationReceipt(JSON.stringify({...locked,encrypted:{...locked.encrypted,rounds:1}})),null);
  assert.equal(parseVerificationReceipt(JSON.stringify({...locked,encrypted:{...locked.encrypted,cipher:"plaintext"}})),null);
});

test("독립 오프라인 검증기도 암호를 해제해 내 표를 확인한다", async () => {
  const start=await createMockNativeState(election);
  const vote=await createVoteReceipt({electionId:election.id,selection:"b"});
  const receipt:SavedReceipt={electionId:election.id,electionName:election.name,...vote,contextHash:await electionContextHash(election)};
  const signed=await appendMockNativeVote(start,receipt);
  const rows=[{receipt_hash:receipt.receiptHash,selection:"b"}];
  const ledger={election_id:election.id,ballot_count:1,ledger_hash:await computeLedgerHash(rows),ballots:rows};
  const bundle=await makeMockAuditBundle(signed.state,ledger,mockElectionResults(election,rows));
  const password="offline verified 123456";
  await assert.rejects(() => protectReceipt(signed.receipt, "123"), /4자 이상/);
  const fourCharacterReceipt=await protectReceipt(signed.receipt,"Ab4!");
  assert.equal((await unlockReceipt(fourCharacterReceipt,"Ab4!")).receiptHash,signed.receipt.receiptHash);
  const locked=await protectReceipt(signed.receipt,password);
  const html=readFileSync("public/audit-verifier.html","utf8");
  assert(html.includes("connect-src 'none'"));
  const script=html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert(script);
  let click:(()=>Promise<void>)|undefined;
  const out={textContent:""};
  const document={
    getElementById(id:string){
      if(id==="verify") return {addEventListener(_event:string,fn:()=>Promise<void>){click=fn;}};
      if(id==="result") return out;
      if(id==="password") return {value:password};
      const data=id==="bundle"?JSON.stringify(bundle):id==="receipt"?JSON.stringify(locked):"";
      return {files:data?[{size:data.length,text:async()=>data}]:[]};
    },
  };
  runInNewContext(script,{document,crypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,console});
  await click!();
  assert(out.textContent.includes("PASS · OWN_BALLOT"),out.textContent.slice(0,600));
  assert(!out.textContent.includes("FAIL"));
});

test("진짜 서명된 접수 기록만 종료 선거의 공개 검증 자료 조회 증명으로 쓸 수 있다", async () => {
  const initial = await createMockNativeState(election);
  const ballot = await createVoteReceipt({electionId:election.id,selection:"a"});
  const saved: SavedReceipt = {
    electionId:election.id,electionName:election.name,...ballot,
    contextHash:await electionContextHash(election),
  };
  const next=await appendMockNativeVote(initial,saved);
  const witness=next.receipt.audit?.witness;
  assert(witness);
  assert.equal(await validReceiptWitness(witness,initial.manifest.payload,election.id,witness.payload),true);
  assert.equal(await validReceiptWitness(witness,initial.manifest.payload,crypto.randomUUID(),witness.payload),false);
  const modified=structuredClone(witness);
  modified.signature="0".repeat(128);
  assert.equal(await validReceiptWitness(modified,initial.manifest.payload,election.id,witness.payload),false);
  const other=structuredClone(witness.payload);
  other.payload.commitment="0".repeat(64);
  assert.equal(await validReceiptWitness(witness,initial.manifest.payload,election.id,other),false);
  const fabricated=structuredClone(witness);
  fabricated.payload.payload.commitment="0".repeat(64);
  assert.equal(await validReceiptWitness(fabricated,initial.manifest.payload,election.id,witness.payload),false);
});
