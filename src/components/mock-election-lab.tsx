"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { BallotSheet } from "@/components/ballot-sheet";
import { VoteCompleteScreen } from "@/components/vote-complete-screen";
import { Alert, Button, Field, Panel } from "@/components/ui";
import ResultsPage from "@/app/results/page";
import VerifyPage from "@/app/verify/page";
import { ballotTypeLabel, normalizeSelection, type BallotSelection } from "@/lib/ballot";
import { mockElectionResults } from "@/lib/mock-election";
import { appendMockNativeVote, createMockNativeState, makeMockAuditBundle, type MockNativeState } from "@/lib/mock-native-audit";
import type { AuditBundle } from "@/lib/native-audit";
import { computeLedgerHash } from "@/lib/verification";
import type { BallotType, Election, PublicBallotLedger, PublicLedgerBallot } from "@/lib/types";
import type { SavedReceipt } from "@/lib/vote-receipt";

type Tab = "ballot" | "complete" | "results" | "verify";
const tabs: { id: Tab; label: string }[] = [
  { id: "ballot", label: "투표" },
  { id: "complete", label: "투표 완료·영수증" },
  { id: "results", label: "투표 결과" },
  { id: "verify", label: "영수증·원장 검증" },
];

export function MockElectionLab() {
  const [name, setName] = useState("관리자 테스트 선거");
  const [options, setOptions] = useState("찬성\n반대");
  const [ballotType, setBallotType] = useState<BallotType>("single");
  const [maxChoices, setMaxChoices] = useState(2);
  const [allowBlank, setAllowBlank] = useState(true);
  const [election, setElection] = useState<Election | null>(null);
  const [ballots, setBallots] = useState<PublicLedgerBallot[]>([]);
  const [ledger, setLedger] = useState<PublicBallotLedger | null>(null);
  const [nativeState, setNativeState] = useState<MockNativeState | null>(null);
  const [bundle, setBundle] = useState<AuditBundle | null>(null);
  const [usedCodes, setUsedCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [tab, setTab] = useState<Tab>("ballot");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setElection(null); setBallots([]); setLedger(null); setNativeState(null); setBundle(null); setUsedCodes([]);
    setReceipt(null); setCode(""); setTab("ballot"); setError("");
  }

  async function create() {
    setError("");
    const candidateNames = options.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!name.trim() || candidateNames.length < 1 || candidateNames.length > 30) {
      setError("투표명과 1~30개의 투표 항목을 입력해주세요."); return;
    }
    if (candidateNames.some(v => v.length > 100)) { setError("항목명은 100자 이내로 입력해주세요."); return; }
    const count = ballotType === "single" ? 1 : ballotType === "approve" ? 1 : Math.max(1,Math.min(Number.isFinite(maxChoices) ? Math.floor(maxChoices) : 1,candidateNames.length));
    const now = new Date();
    const item: Election = {
      id: crypto.randomUUID(), name: name.trim(), organization_name: "모의 선거",
      description: "관리자 브라우저에서만 실행되는 모의 선거입니다.", candidates: candidateNames.map((value,index) => ({id: `option_${index+1}`,name:value})),
      ballot_type: ballotType, min_choices: ballotType === "single" || ballotType === "approve" ? 1 : 1,
      max_choices: count, allow_blank: allowBlank, total_voter_codes: 0, status: "active",
      audit_version: 1, starts_at: now.toISOString(), ends_at: new Date(now.getTime()+86400000).toISOString(),
      created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    const emptyHash = await computeLedgerHash([]);
    const emptyLedger = { election_id: item.id, ballot_count: 0, ledger_hash: emptyHash, ballots: [] };
    const initialNative = await createMockNativeState(item);
    const initialBundle = await makeMockAuditBundle(initialNative, emptyLedger, mockElectionResults(item,[]));
    setElection(item); setNativeState(initialNative); setBundle(initialBundle);
    setLedger(emptyLedger);
    setBallots([]); setUsedCodes([]); setReceipt(null); setCode("");
    setTab("ballot");
  }

  async function cast(choice: BallotSelection, savedReceipt: SavedReceipt) {
    if (!election || !nativeState || busy) throw new Error("모의 선거가 준비되지 않았습니다.");
    setError("");
    const key = code.trim().toLocaleUpperCase();
    if (!key || key.length > 100) throw new Error("테스트 코드를 1~100자로 입력해주세요. 어떤 코드라도 사용할 수 있습니다.");
    if (usedCodes.includes(key)) throw new Error("이 코드는 이미 사용했습니다. 다른 테스트 코드를 입력해주세요.");
    const normalized = normalizeSelection(election.candidates, election, choice);
    if (!normalized.ok) throw new Error(normalized.message);
    if (election.status !== "active") throw new Error("모의 종료 상태입니다.");
    setBusy(true);
    try {
      const next = [...ballots, { receipt_hash: savedReceipt.receiptHash, selection: normalized.canonical }];
      const ordered = [...next].sort((a,b) => a.receipt_hash < b.receipt_hash ? -1 : a.receipt_hash > b.receipt_hash ? 1 : 0);
      const hash = await computeLedgerHash(ordered);
      const nextLedger = { election_id: election.id, ballot_count: next.length, ledger_hash: hash, ballots: ordered };
      const signed = await appendMockNativeVote(nativeState, savedReceipt);
      const nextBundle = await makeMockAuditBundle(signed.state, nextLedger, mockElectionResults(election, next));
      setUsedCodes(current => [...current,key]);
      setBallots(next); setNativeState(signed.state); setBundle(nextBundle);
      setLedger(nextLedger);
      setReceipt({...signed.receipt,electionName:signed.receipt.electionName + " [모의]"}); setCode(""); setTab("complete");
    } finally { setBusy(false); }
  }

  const snapshot = election ? { ...election, status: "closed" as const, closed_at: new Date().toISOString() } : null;

  return <div className="mx-auto grid max-w-4xl gap-5">
    <div>
      <Link href="/admin/manage" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><ArrowLeft size={17} /> 관리자 메뉴</Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-950">모의 선거 테스트실</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">실제 투표지·완료·결과·검증 화면 컴포넌트를 그대로 열어 시험합니다. 모의 데이터는 이 화면의 메모리에서만 유지되며 운영 DB·유권자·포인트·문자 발송에 영향을 주지 않습니다.</p>
    </div>
    <Alert tone="info">모의 결과·원장은 <strong>선거를 종료하지 않아도</strong> 확인할 수 있습니다. 실제 선거는 종료 전 결과와 원장을 공개하지 않습니다. 모의 서명은 브라우저에서 생성한 임시 키로 검증하며, 실제 운영 서명키·원장과는 무관합니다.</Alert>
    {!election ? <Panel className="grid gap-4 p-5">
      <h2 className="text-lg font-semibold">새 모의 선거 만들기</h2>
      <Field label="투표명" value={name} onChange={event => setName(event.target.value)} maxLength={120}/>
      <label className="grid gap-2 text-sm font-medium text-slate-700">투표 항목 (한 줄에 하나)
        <textarea rows={5} value={options} onChange={event => setOptions(event.target.value)} className="rounded-xl border border-slate-200 bg-white p-3 text-base" />
      </label>
      <label className="grid gap-2 text-sm font-medium text-slate-700">투표 방식
        <select value={ballotType} onChange={event => setBallotType(event.target.value as BallotType)} className="h-11 rounded-xl border border-slate-200 bg-white px-3">
          <option value="single">하나 선택</option><option value="multi">여러 개 선택</option><option value="approve">항목별 찬성·반대</option><option value="rank">순위 투표</option>
        </select>
      </label>
      {ballotType === "multi" || ballotType === "rank" ? <Field type="number" min={1} max={30} label="최대 선택 개수" value={maxChoices} onChange={event => setMaxChoices(Number(event.target.value))} /> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowBlank} onChange={event => setAllowBlank(event.target.checked)}/>기권 허용</label>
      {error ? <Alert>{error}</Alert> : null}
      <Button onClick={() => void create()}>모의 선거 생성</Button>
    </Panel> : <>
      <Panel className="grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{election.name}</h2><p className="mt-1 text-sm text-slate-500">{ballotTypeLabel(election.ballot_type)} · 모의 투표 {ballots.length}표 · 사용한 코드 {usedCodes.length}개 · {election.status === "closed" ? "모의 종료" : "모의 진행중"}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => {setElection({...election,status:election.status==="closed"?"active":"closed"});setError("");}}>{election.status === "closed" ? "다시 진행" : "모의 종료"}</Button>
            <Button variant="secondary" onClick={reset}><RotateCcw size={16}/>새 선거 만들기</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tabs.map(item => <Button key={item.id} variant={tab === item.id ? "primary" : "secondary"} onClick={() => setTab(item.id)} disabled={item.id === "complete" && !receipt}>{item.label}</Button>)}
        </div>
      </Panel>
      {tab === "ballot" ? <div className="grid gap-4">
        <Panel className="grid gap-3 p-5">
          <Field label="테스트 투표 코드 (아무 문자나 입력)" value={code} onChange={event => setCode(event.target.value)} placeholder="예: TEST-001, A, 1234" />
          <p className="text-xs text-slate-600">테스트용 코드이므로 문자 인증이나 실명부 조회 없이 한 코드당 한 번 접수합니다.</p>
        </Panel>
        {election.status === "closed" ? <Panel className="p-5"><Alert>모의 종료 상태입니다. 위의 ‘다시 진행’을 누르면 추가 투표할 수 있습니다.</Alert></Panel> :
          <BallotSheet key={election.id} election={election} notice="관리자 모의 투표입니다. 실제로 접수되지 않습니다." submit={async () => {throw new Error("모의 투표는 운영 서버로 제출할 수 없습니다.");}} simulatedSubmit={cast} />}
        {error ? <Alert>{error}</Alert> : null}
      </div> : null}
      {tab === "complete" && receipt ? <VoteCompleteScreen key={receipt.receiptHash} simulatedReceipt={receipt} onSimulatedVerify={() => setTab("verify")} onSimulatedBallot={() => setTab("ballot")}/> : null}
      {tab === "results" && snapshot ? <ResultsPage key={`results-${ballots.length}`} simulation={{ election:snapshot, results:mockElectionResults(snapshot,ballots) }}/> : null}
      {tab === "verify" && snapshot && ledger && bundle ? <VerifyPage key={`verify-${ledger.ledger_hash}`} simulation={{ election:snapshot, ledger }} initialReceipt={receipt?.receiptHash ?? ""} simulatedBundle={bundle} simulatedReceipt={receipt ?? undefined}/> : null}
      <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={16}/>모든 결과는 합성 데이터입니다. 브라우저 새로고침 시 테스트 내용은 초기화됩니다.</p>
    </>}
  </div>;
}
