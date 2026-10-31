import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonical, commitment, digest, eventHead, hashObject, newSecret, recount, verifyBundle, verifySignature, type AuditBundle, type AuditEvent, type Manifest, type Signed } from "../native-audit.ts";
import { parseSavedReceipt, type SavedReceipt } from "../vote-receipt.ts";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

async function fixture() {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = keys.publicKey.export({ format: "jwk" });
  const keyId = await hashObject(publicKey);
  const seal = <T>(payload: T): Signed<T> => ({ payload: structuredClone(payload), keyId, signature: sign("sha256", Buffer.from(canonical(payload)), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("hex") });
  const m: Manifest = { format: "moai-manifest-v1", election: { id: "11111111-1111-1111-1111-111111111111", name: "합성 투표", description: null, candidates: [{ id: "a", name: "가" }, { id: "b", name: "나" }], ballot_type: "single", min_choices: 1, max_choices: 1, allow_blank: true, starts_at: null, ends_at: null }, electorate: 2, smsRequired: false, singleCast: true, publicKey, keyId };
  const manifest = seal(m), mh = await hashObject(m), salt = newSecret(), secret = newSecret();
  const receiptHash = await digest(`${m.election.id}|a|${salt}`), c = await commitment(m.election.id, mh, receiptHash, secret);
  const vote: AuditEvent = { format: "moai-event-v1", electionId: m.election.id, manifestHash: mh, index: 1, kind: "vote", payload: { commitment: c }, previous: mh, head: "" };
  vote.head = await eventHead(vote);
  const ledger = { election_id: m.election.id, ballot_count: 1, ballots: [{ receipt_hash: receiptHash, selection: "a" }], ledger_hash: await digest(`${receiptHash}:a`) };
  const results = recount(m, ledger.ballots);
  const final: AuditEvent = { format: "moai-event-v1", electionId: m.election.id, manifestHash: mh, index: 2, kind: "final", payload: { ledgerHash: ledger.ledger_hash, commitmentHash: await hashObject([c]), ballotCount: 1, resultHash: await hashObject(results) }, previous: vote.head, head: "" };
  final.head = await eventHead(final);
  const bundle: AuditBundle = { format: "moai-audit-bundle-v1", manifest, events: [vote, final], ledger, results, final: seal(final) };
  const receipt: SavedReceipt = { electionId: m.election.id, electionName: m.election.name, receiptHash, salt, audit: { secret, commitment: c, manifest, witness: seal(vote) } };
  return { bundle, receipt, seal };
}
test("표준 P-256 서명·약정·개인 표·집계와 보관 시작 규칙을 검증한다", async () => {
  const { bundle, receipt } = await fixture();
  const checks = await verifyBundle(bundle, receipt);
  assert.equal(checks.some(c => c.status === "FAIL"), false);
  for (const check of ["MANIFEST_ANCHOR", "MANIFEST_SIGNATURE", "FINAL_SIGNATURE", "HISTORY_AND_LEDGER", "TALLY_RECOUNT", "OWN_COMMITMENT", "OWN_BALLOT", "OWN_WITNESS"]) assert.equal(checks.find(c => c.check === check)?.status, "PASS", check);
  assert.deepEqual(parseSavedReceipt(JSON.stringify(receipt)), receipt);
});
test("첫 투표 전 일정 변경 이력은 허용하고 투표 후 변경은 거부한다",async()=>{
 for(const afterVote of [false,true]){
  const {bundle,seal}=await fixture();
  const schedule:AuditEvent={...bundle.events[0],kind:"schedule",payload:{startsAt:"2026-11-01T00:00:00.000Z"}};
  bundle.events.splice(afterVote?1:0,0,schedule);
  let previous=await hashObject(bundle.manifest.payload);
  for(const [i,event] of bundle.events.entries()){event.index=i+1;event.previous=previous;event.head=await eventHead(event);previous=event.head;}
  bundle.final=seal(bundle.events.at(-1)!);
  assert.equal((await verifyBundle(bundle)).some(c=>c.status==="FAIL"),afterVote);
 }
});
test("독립 시작 사본·실제 자격 의사·문자 인증 수행을 검증 성공으로 과장하지 않는다", async () => {
  const { bundle } = await fixture();
  const checks = await verifyBundle(bundle);
  for (const name of ["MANIFEST_ANCHOR", "PRECAST_AUTH_DECLARED", "ELIGIBILITY_AND_CORRESPONDENCE"]) assert.equal(checks.find(c => c.check === name)?.status, "UNCONFIRMED");
});
test("키 바꿔치기·위조 서명·다른 선거/규칙을 거부한다", async () => {
  for (const mode of ["key", "signature", "election", "rule"]) {
    const { bundle, receipt } = await fixture();
    if (mode === "key") bundle.manifest.payload.keyId = "다른 키";
    if (mode === "signature") bundle.final.signature = "0".repeat(128);
    if (mode === "election") bundle.manifest.payload.election.id = "22222222-2222-2222-2222-222222222222";
    if (mode === "rule") bundle.manifest.payload.election.allow_blank = false;
    assert.ok((await verifyBundle(bundle, receipt)).some(c => c.status === "FAIL"), mode);
  }
});
test("공개 자료는 접수 순서와 표를 직접 연결하는 영수증/salt/opening을 포함하지 않는다", async () => {
  const { bundle, receipt } = await fixture();
  const events = JSON.stringify(bundle.events);
  for (const secret of [receipt.salt, receipt.receiptHash, receipt.audit!.secret]) assert.ok(!events.includes(secret));
  const again = await commitment(receipt.electionId, await hashObject(bundle.manifest.payload), receipt.receiptHash, newSecret());
  assert.notEqual(again, receipt.audit!.commitment);
  const leaked = structuredClone(bundle);
  leaked.events[0].payload.receiptHash = receipt.receiptHash;
  leaked.events[0].head = await eventHead(leaked.events[0]);
  assert.ok((await verifyBundle(leaked)).some(c => c.status === "FAIL"));
});
test("약정/표 누락·중복·결과 변경·연결 변경을 거부한다", async () => {
  for (const mode of ["event", "ballot", "duplicate", "result", "previous", "count"]) {
    const { bundle, receipt } = await fixture();
    if (mode === "event") bundle.events.shift();
    if (mode === "ballot") bundle.ledger.ballots.length = 0;
    if (mode === "duplicate") bundle.ledger.ballots.push(bundle.ledger.ballots[0]);
    if (mode === "result") bundle.results.candidates[0].votes = 0;
    if (mode === "previous") bundle.events[1].previous = "0".repeat(64);
    if (mode === "count") bundle.ledger.ballot_count = 2;
    assert.ok((await verifyBundle(bundle, receipt)).some(c => c.status === "FAIL"), mode);
  }
});
test("다르게 서명한 유효 최종 분기는 저장한 접수 증언과 충돌한다", async () => {
  const { bundle, receipt, seal } = await fixture();
  bundle.events[0].payload.commitment = newSecret();
  bundle.events[0].head = await eventHead(bundle.events[0]);
  bundle.events[1].previous = bundle.events[0].head;
  bundle.events[1].payload.commitmentHash = await hashObject([bundle.events[0].payload.commitment]);
  bundle.events[1].head = await eventHead(bundle.events[1]);
  bundle.final = seal(bundle.events[1]);
  const checked = await verifyBundle(bundle, receipt);
  assert.equal(checked.find(c => c.check === "SIGNED_HISTORY_CONFLICT")?.status, "FAIL");
  assert.equal(checked.find(c => c.check === "HISTORY_AND_LEDGER")?.status, "PASS");
});
test("서명이 없는 임의 개인 파일은 운영자의 상충 서명 증거가 아니다", async () => {
  const { bundle, receipt } = await fixture();
  receipt.audit!.witness!.signature = "0".repeat(128);
  const checks = await verifyBundle(bundle, receipt);
  assert.ok(!checks.some(c => c.check === "SIGNED_HISTORY_CONFLICT"));
  assert.equal(checks.find(c => c.check === "OWN_WITNESS")?.status, "FAIL");
});
test("개인 비밀 없이도 독립 보관한 서명 기준점을 최종 이력과 비교한다", async () => {
  const { bundle, seal } = await fixture();
  const anchor = { manifest: bundle.manifest, checkpoint: seal(bundle.events[0]) };
  assert.equal((await verifyBundle(bundle, undefined, anchor)).find(c => c.check === "EXTERNAL_CHECKPOINT")?.status, "PASS");
  const other = structuredClone(bundle);
  other.events[0].payload.commitment = newSecret();
  other.events[0].head = await eventHead(other.events[0]);
  other.events[1].previous = other.events[0].head;
  other.events[1].payload.commitmentHash = await hashObject([other.events[0].payload.commitment]);
  other.events[1].head = await eventHead(other.events[1]);
  other.final = seal(other.events[1]);
  assert.equal((await verifyBundle(other, undefined, anchor)).find(c => c.check === "SIGNED_HISTORY_CONFLICT")?.status, "FAIL");
});
test("독립 집계는 순위 점수·기권·찬반·정규 순서를 검사한다", async () => {
  const { bundle } = await fixture();
  const m = bundle.manifest.payload;
  m.election.ballot_type = "rank"; m.election.max_choices = 2;
  const t = recount(m, [{ receipt_hash: "a".repeat(64), selection: "b>a" }, { receipt_hash: "b".repeat(64), selection: "BLANK" }]);
  assert.equal(t.blank_ballots, 1); assert.equal(t.candidates[1].points, 2); assert.equal(t.candidates[0].points, 1);
  assert.throws(() => recount(m, [{ receipt_hash: "a".repeat(64), selection: "a>a" }]));
  m.election.ballot_type = "multi";
  assert.throws(() => recount(m, [{ receipt_hash: "a".repeat(64), selection: "b,a" }]));
  m.election.ballot_type = "approve";
  assert.throws(() => recount(m, [{ receipt_hash: "a".repeat(64), selection: "a:yes" }]));
});
test("오프라인 검증 HTML은 네트워크 없이 실제 묶음을 검사한다", async () => {
  const { bundle, receipt } = await fixture();
  const html = readFileSync("public/audit-verifier.html", "utf8");
  assert.ok(html.includes("connect-src 'none'"));
  const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
  let click: (() => Promise<void>) | undefined;
  const result = { textContent: "" };
  const doc = { getElementById(id: string) {
    if (id === "verify") return { addEventListener(_name: string, fn: () => Promise<void>) { click = fn; } };
    if (id === "result") return result;
    const text = id === "bundle" ? JSON.stringify(bundle) : id === "receipt" ? JSON.stringify(receipt) : JSON.stringify(bundle.manifest);
    return { files: [{ size: text.length, text: async () => text }] };
  } };
  runInNewContext(script, { document: doc, crypto, TextEncoder, Uint8Array, console });
  await click!();
  assert.ok(result.textContent.includes("PASS · TALLY_RECOUNT"));
  assert.ok(!result.textContent.includes("FAIL"));
});
test("서명 검증은 잘못된 hex·다른 키 식별자를 거부한다", async () => {
  const { bundle } = await fixture();
  assert.equal(await verifySignature({ ...bundle.manifest, signature: "bad" }, bundle.manifest.payload), false);
  assert.equal(await verifySignature({ ...bundle.manifest, keyId: "bad" }, bundle.manifest.payload), false);
});
