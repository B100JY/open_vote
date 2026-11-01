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
