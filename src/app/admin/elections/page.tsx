"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { downloadTextFile } from "@/lib/receipt-file";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Mail,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Badge, Button, EmptyState, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import type {
  Election,
  ElectionStatus,
  VoterRegistry,
} from "@/lib/types";
import {
  csvEscape,
  formatDate,
  statusLabel,
  statusTone,
} from "@/lib/utils";
import { ballotTypeLabel } from "@/lib/ballot";
import { electionNumber } from "@/lib/election-search";
import { SMS_TITLE_MAX, defaultSmsTitle } from "@/lib/sms-title";
import { SmsSendDialog } from "@/components/sms-send-dialog";
import { formatPhone } from "@/lib/voters";

type CodesResponse = {
  election: { id: string; name: string } | null;
  voters: VoterRegistry[];
};

export default function ManageElectionsPage() {
  const adminOnly = usePathname() === "/admin/manage/elections";
  return (
    <AdminGate adminOnly={adminOnly}>
      <ManageElections />
    </AdminGate>
  );
}

function ManageElections() {
  const allElections = usePathname() === "/admin/manage/elections";
  const [trash,setTrash] = useState(false);
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [invitingId, setInvitingId] = useState("");
  const [sendDialog, setSendDialog] = useState<{election: Election; resendAll: boolean; startBeforeSend?: boolean} | null>(null);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ elections: Election[] }>(`/api/elections?scope=${allElections ? "all" : "mine"}${trash?"&trash=1":""}`, {
        headers: await authHeaders(),
      });
      setElections(data.elections);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "선거 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [allElections,trash]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(election: Election, status: ElectionStatus) {
    if (
      status === "closed" &&
      !window.confirm("선거를 종료하면 다시 열 수 없고 결과가 공개됩니다. 종료할까요?")
    ) {
      return;
    }
    setUpdatingId(election.id);
    setError("");
    try {
      await fetchJson<{ election: Election }>(`/api/elections/${election.id}`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상태 변경에 실패했습니다.");
    } finally {
      setUpdatingId("");
    }
  }

  async function downloadParticipants(election: Election) {
    setError("");
    try {
      const data = await fetchJson<CodesResponse>(
        `/api/elections/${election.id}/participants`,
        { headers: await authHeaders() },
      );
      const lines = [
        `선거명: ${csvEscape(election.name)}`,
        "연락처,이름,투표여부,링크발송시각",
        ...data.voters.map((voter) =>
          [
            csvEscape(voter.phone ? formatPhone(voter.phone) : (voter.email ?? "")),
            csvEscape(voter.voter_name ?? ""),
            csvEscape(voter.has_voted ? "투표완료" : "투표전"),
            csvEscape(voter.invited_at),
          ].join(","),
        ),
      ];

      const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `voter_registry_${election.name}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CSV 다운로드에 실패했습니다.");
    }
  }

  async function sendMagicLinks(election: Election) {
    setInvitingId(election.id);
    setError("");
    setNotice("");
    try {
      const result = await fetchJson<{ sent: number; failed: number }>(
        `/api/elections/${election.id}/participants/invite`,
        { method: "POST", headers: await authHeaders() },
      );
      await load();
      if (result.failed > 0) {
        setError(
          `매직 링크 ${result.sent}건 발송, ${result.failed}건 실패했습니다. Supabase Auth 이메일 설정을 확인해주세요.`,
        );
      } else {
        setNotice(`매직 링크 ${result.sent}건을 발송했습니다.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "매직 링크 발송에 실패했습니다.");
    } finally {
      setInvitingId("");
    }
  }

  function sendSmsInvites(election: Election, resendAll: boolean) { setSendDialog({election,resendAll}); }
  async function lifecycle(election:Election,action:string,startsAt?:string){
    if(action==="trash"&&!confirm("휴지통으로 옮기면 참여가 중단됩니다. 60일 뒤 이의제기가 없으면 삭제됩니다. 옮길까요?"))return;
    setUpdatingId(election.id);setError("");try{await fetchJson(`/api/elections/${election.id}/lifecycle`,{method:"POST",headers:await authHeaders(),body:JSON.stringify({action,startsAt})});await load();}catch(e){setError(e instanceof Error?e.message:"변경하지 못했습니다.");}finally{setUpdatingId("");}
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            투표 생성
          </Link>
          <h1 className="text-2xl font-semibold text-slate-950">{allElections ? "전체 투표 관리" : "내 투표 관리"}</h1>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={18} aria-hidden="true" />
          새로고침
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <div className="flex flex-wrap gap-3"><Button variant={trash?"secondary":"primary"} onClick={()=>setTrash(false)}>투표 목록</Button><Button variant={trash?"primary":"secondary"} onClick={()=>setTrash(true)}>휴지통</Button><Link className="self-center text-blue-700 underline" href="/contacts">명부·휴대폰 단체문자</Link></div>
      {trash&&<Alert>휴지통에 옮긴 날부터 60일간 보관합니다. 투표자는 기존 코드로 삭제 이의를 제기할 수 있으며, 이의제기가 있으면 자동 삭제를 보류합니다.</Alert>}

      {loading ? (
        <div className="grid gap-3">
          <Skeleton />
          <Skeleton />
        </div>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<Square size={28} aria-hidden="true" />}
          title="생성된 선거가 없습니다"
          description="새 투표를 생성하면 상태 관리와 CSV 다운로드가 가능합니다."
        />
      ) : (
        <div className="grid gap-3">
          {elections.map((election) => (
            <Panel key={election.id} className="p-5">
              {trash?<div className="grid gap-3"><h2 className="text-lg font-bold">{election.name}</h2><p>{election.objection_count?`이의제기 ${election.objection_count}건 · 삭제 보류`:`${formatDate(election.purge_after)} 이후 자동 삭제 예정`}</p><Button disabled={updatingId===election.id} onClick={()=>void lifecycle(election,"restore")}>휴지통에서 복원</Button></div>:<>
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusTone(election.status)}>
                      {statusLabel(election.status)}
                    </Badge>
                    <span className="text-sm text-slate-500">
                      {formatDate(election.created_at)}
                    </span>
                  </div>
                  {election.organization_name ? <p className="mt-3 text-sm font-medium text-blue-700">{election.organization_name}</p> : null}
                  <h2 className="mt-3 text-lg font-semibold text-slate-950">
                    {election.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                    {election.description || "설명이 등록되지 않았습니다."}
                  </p>
                  {election.audit_version === 1 ? <Button variant="secondary" onClick={async()=>{try{const data=await fetchJson<{manifest:unknown}>(`/api/elections/${election.id}/audit`,{method:"POST",headers:await authHeaders(),body:"{}"});downloadTextFile(`모아이투표-${election.id}-시작규칙.json`,JSON.stringify(data.manifest));}catch{setError("시작 규칙 서명을 준비하지 못했습니다.");}}}>서명된 시작 규칙 저장</Button> : null}
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
                    <span className="font-semibold text-slate-700">투표 번호 {electionNumber(election.id)}</span>
                    <span>등록 유권자 {election.total_voter_codes}명</span>
                    <span>{ballotTypeLabel(election.ballot_type)}</span>
                    <span>항목 {election.candidates.length}개</span>
                    <span>시작 {formatDate(election.starts_at)}</span>
                    <span>마감 {formatDate(election.ends_at)}</span>
                  </div>
                  {election.auth_mode === "sms_token" && election.status !== "closed" ? (
                    <SmsTitleEditor
                      election={election}
                      onSaved={(updated) =>
                        setElections((current) => current.map((item) => (item.id === updated.id ? updated : item)))
                      }
                    />
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => downloadParticipants(election)}
                  >
                    <Download size={17} aria-hidden="true" />
                    CSV
                  </Button>
                  {election.status === "active" ? (
                    <>
                      <Button
                        onClick={() => sendSmsInvites(election, false)}
                        disabled={sendDialog !== null}
                      >
                        <MessageSquareText size={17} aria-hidden="true" />
                        문자 발송
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => sendSmsInvites(election, true)}
                        disabled={sendDialog !== null}
                        title="미투표 전원에게 새 링크 재발송 (이전 링크 무효화)"
                      >
                        <RotateCcw size={17} aria-hidden="true" />
                        재발송
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => sendMagicLinks(election)}
                        disabled={invitingId === election.id}
                      >
                        <Mail size={17} aria-hidden="true" />
                        이메일 링크
                      </Button>
                    </>
                  ) : null}
                  {election.status === "draft" ? (
                    <Button
                      onClick={() => election.auth_mode === "sms_token" ? setSendDialog({election,resendAll:false,startBeforeSend:true}) : updateStatus(election, "active")}
                      disabled={updatingId === election.id}
                    >
                      <Play size={17} aria-hidden="true" />
                      시작
                    </Button>
                  ) : null}
                  {election.status === "active" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => updateStatus(election, "paused")}
                        disabled={updatingId === election.id}
                      >
                        <Pause size={17} aria-hidden="true" />
                        일시중단
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => updateStatus(election, "closed")}
                        disabled={updatingId === election.id}
                      >
                        <CheckCircle2 size={17} aria-hidden="true" />
                        종료
                      </Button>
                    </>
                  ) : null}
                  {election.status === "paused" ? (
                    <>
                      <Button
                        onClick={() => updateStatus(election, "active")}
                        disabled={updatingId === election.id}
                      >
                        <Play size={17} aria-hidden="true" />
                        재개
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => updateStatus(election, "closed")}
                        disabled={updatingId === election.id}
                      >
                        <CheckCircle2 size={17} aria-hidden="true" />
                        종료
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <details className="mt-4 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer py-2 text-sm text-blue-700">홈 표시·공개 범위 · 종료 후 {election.home_closed_days ?? 7}일</summary>
                <form className="mt-2 flex flex-wrap items-end gap-3" onSubmit={async (event) => {
                  event.preventDefault();
                  const days = Number(new FormData(event.currentTarget).get("homeClosedDays"));
                  const contentRestricted = new FormData(event.currentTarget).get("contentRestricted") === "on";
                  setUpdatingId(election.id); setError(""); setNotice("");
                  try {
                    await fetchJson(`/api/elections/${election.id}/lifecycle`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ action: "home_visibility", days, contentRestricted }) });
                    await load(); setNotice(days === 0 ? "종료 후 홈에서 숨기도록 설정했습니다." : `종료 후 ${days}일 동안 홈에 표시합니다.`);
                  } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); }
                  finally { setUpdatingId(""); }
                }}>
                  <label className="grid gap-2 text-sm">홈 표시 기간 (일)
                    <input name="homeClosedDays" type="number" min={0} max={365} step={1} required defaultValue={election.home_closed_days ?? 7} className="h-11 w-32 rounded-xl border border-slate-200 px-3" />
                  </label>
                  <Button type="submit" variant="secondary" disabled={updatingId === election.id}>설정 저장</Button>
                  <label className="flex w-full items-start gap-2 text-sm"><input type="checkbox" name="contentRestricted" defaultChecked={election.content_restricted !== false} className="mt-1" />기본 정보는 홈에 표시하고, 내용·결과는 투표 링크나 코드로 확인한 사람에게만 공개</label>
                  <p className="w-full text-sm text-slate-500">기본 7일 · 0일은 종료 후 숨김. 홈에서 사라져도 기존 링크로 결과를 볼 수 있습니다.</p>
                </form>
              </details>
              {election.auth_mode === "sms_token" ? <VoterResendList election={election} /> : null}
              <div className="mt-4 flex flex-wrap gap-3 border-t pt-4"><Button variant="secondary" disabled={updatingId===election.id} onClick={()=>void lifecycle(election,"trash")}>휴지통으로 이동</Button>{election.status!=="closed"&&<details><summary className="cursor-pointer py-3 text-blue-700">시작일 변경</summary><form className="grid gap-3 py-3" onSubmit={e=>{e.preventDefault();const value=new FormData(e.currentTarget).get("startsAt");if(typeof value==="string"&&value)void lifecycle(election,"schedule",new Date(value).toISOString());}}><label>새 시작일 <input aria-label="새 시작일" name="startsAt" type="datetime-local" required className="rounded border p-2"/></label><p className="text-sm text-slate-600">첫 투표 접수 전까지 변경 가능합니다. 마감일은 유지됩니다.</p><Button type="submit" disabled={updatingId===election.id}>시작일 저장</Button></form></details>}</div>
              </>}
            </Panel>
          ))}
        </div>
      )}
      {sendDialog ? <SmsSendDialog {...sendDialog} onClose={()=>setSendDialog(null)} onStarted={()=>{setNotice("투표를 시작했습니다."); void load();}} onSent={result=>{setNotice(`문자 ${result.sent ?? 0}건 발송 · ${result.cost ?? 0}P 사용 · ${result.refunded ?? 0}P 반환`); void load();}}/> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <Panel className="p-5">
      <div className="h-7 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mt-4 h-6 w-2/5 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
    </Panel>
  );
}

/** 안내 문자 제목 보기·고치기(생성자가 고칠 수 있는 유일한 문구). */
function SmsTitleEditor({ election, onSaved }: { election: Election; onSaved: (election: Election) => void }) {
  const current = election.sms_title?.trim() || "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await fetchJson<{ election: Election }>(`/api/elections/${election.id}/sms-title`, {
        method: "PATCH",
        headers: await authHeaders(),
        body: JSON.stringify({ smsTitle: value }),
      });
      onSaved(result.election);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <p className="mt-2 text-sm text-slate-500">
        문자 제목: <span className="text-slate-800">{current || defaultSmsTitle(election.name)}</span>{" "}
        <button type="button" className="text-blue-700 underline underline-offset-2" onClick={() => setEditing(true)}>
          고치기
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 grid max-w-md gap-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={SMS_TITLE_MAX}
          placeholder={defaultSmsTitle(election.name)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 text-sm outline-none focus:border-blue-500"
        />
        <Button onClick={save} disabled={saving} className="h-10">
          {saving ? "저장 중" : "저장"}
        </Button>
        <Button variant="secondary" onClick={() => { setEditing(false); setValue(current); setError(""); }} className="h-10">
          취소
        </Button>
      </div>
      <p className="text-xs text-slate-500">다음에 보내는 문자부터 적용됩니다. 비우면 기본 제목.</p>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

const MAX_ADMIN_RESEND = 5;

/**
 * 유권자 목록 + 한 사람에게 다시 보내기(유권자당 최대 5회, 1회마다 1인 단가 차감).
 * 열 때만 명부를 불러온다.
 */
function VoterResendList({ election }: { election: Election }) {
  const [open, setOpen] = useState(false);
  const [voters, setVoters] = useState<VoterRegistry[] | null>(null);
  const [selectedVoter, setSelectedVoter] = useState<VoterRegistry | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = election.status === "active";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && voters === null) {
      try {
        const data = await fetchJson<CodesResponse>(`/api/elections/${election.id}/participants`, {
          headers: await authHeaders(),
        });
        setVoters(data.voters);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "유권자 명부를 불러오지 못했습니다.");
      }
    }
  }

  function resend(voter: VoterRegistry) { setSelectedVoter(voter); }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-3">
      <button type="button" onClick={toggle} className="text-sm font-semibold text-blue-700">
        {open ? "유권자 목록 닫기" : "유권자 목록 · 개별 재발송"}
      </button>
      {open ? (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-slate-500">
            한 사람에게 새 링크·코드를 다시 보냅니다(유권자당 최대 {MAX_ADMIN_RESEND}번, 선택한 문자 형식의 요금 차감). 예전 링크·코드는 더 쓸 수 없습니다.
          </p>
          {message ? <Alert tone="success">{message}</Alert> : null}
          {error ? <Alert>{error}</Alert> : null}
          {voters === null && !error ? <p className="text-sm text-slate-400">불러오는 중</p> : null}
          {voters && voters.length > 0 ? (
            <ul className="grid divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {voters.map((voter) => {
                const count = voter.admin_resend_count ?? 0;
                const disabled = !active || voter.has_voted || !voter.phone || count >= MAX_ADMIN_RESEND || selectedVoter !== null;
                return (
                  <li key={voter.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-800">{voter.voter_name ?? "이름 없음"}</span>{" "}
                      <span className="text-slate-500">{voter.phone ? formatPhone(voter.phone) : voter.email}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {voter.has_voted ? "투표완료" : voter.invited_at ? "발송됨" : "미발송"} · 재발송 {count}/{MAX_ADMIN_RESEND}
                      </span>
                      <Button
                        variant="secondary"
                        className="min-h-9 px-3"
                        disabled={disabled}
                        onClick={() => resend(voter)}
                      >
                        다시 보내기
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      {selectedVoter ? <SmsSendDialog election={election} voterId={selectedVoter.id} onClose={()=>setSelectedVoter(null)} onSent={result=>{setMessage(`${result.message ?? "발송 완료"} (${result.cost ?? 0}P 사용)`);setVoters(items=>(items??[]).map(v=>v.id===selectedVoter.id?{...v,invited_at:new Date().toISOString(),admin_resend_count:result.resendCount??(v.admin_resend_count??0)+1}:v));}}/> : null}
    </div>
  );
}
