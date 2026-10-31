"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Button, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";

type Settings = { enabled: boolean; signup_enabled: boolean; election_enabled: boolean; vote_enabled: boolean };
type Event = { id: string; kind: string; title: string; state: string; created_at: string; attempts: number; last_error: string | null };
const kinds: Record<string, string> = { signup: "회원 가입", election_created: "투표 생성", vote_cast: "투표 접수" };
const states: Record<string, string> = { pending: "발송 대기", sending: "발송 중", sent: "발송 완료", failed: "발송 실패", skipped: "발송 안 함" };
export default function NotificationsPage() { return <AdminGate adminOnly><Notifications /></AdminGate>; }
function Notifications() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [configured, setConfigured] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(start: number) {
    const response = await fetch(`/api/admin/notifications?offset=${start}`, { headers: await authHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error("알림을 불러오지 못했습니다.");
    const result = await response.json();
    setSettings(result.settings); setEvents(result.events); setConfigured(result.webhookConfigured);
  }
  useEffect(() => { let live = true; void load(offset).catch(() => { if (live) setError("알림을 불러오지 못했습니다."); }); return () => { live = false; }; }, [offset]);
  async function update(change?: Partial<Settings>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/notifications", { method: change ? "PATCH" : "POST", headers: { ...await authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(change ?? {}) });
      if (!response.ok) throw new Error("알림 설정을 처리하지 못했습니다.");
      await load(offset); setNotice(change ? "설정을 저장했습니다." : "대기 알림 처리를 요청했습니다. 잠시 후 새로고침해주세요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "처리 실패"); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto grid max-w-4xl gap-5">
    <Link href="/admin/manage" className="text-sm font-semibold text-blue-700">← 관리자 메뉴</Link>
    <Panel className="p-5 sm:p-6">
      <h1 className="text-xl font-bold">구글챗 알림 관리</h1>
      <p className="mt-2 text-sm text-slate-600">선택 내용·투표자 개인정보는 보내지 않습니다. 끈 동안에도 발생 기록은 이 목록에 남습니다.</p>
      {!configured && <div className="mt-4"><Alert>구글챗 웹훅이 설정되지 않았습니다. 알림은 목록에 보관되며 외부로 발송되지 않습니다.</Alert></div>}
      {settings && <div className="mt-5 grid gap-4 sm:grid-cols-2">{([
        ["enabled", "구글챗 발송 전체"], ["signup_enabled", "회원 가입"], ["election_enabled", "투표 생성"], ["vote_enabled", "모든 투표 접수"],
      ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={settings[key]} disabled={busy} onChange={e => void update({ [key]: e.target.checked })} className="h-5 w-5" />{label}</label>)}</div>}
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}{notice && <div className="mt-4"><Alert tone="success">{notice}</Alert></div>}
      <div className="mt-5 flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => void load(offset).catch(() => setError("조회 실패"))}>새로고침</Button><Button disabled={busy || !configured} onClick={() => void update()}>대기 알림 처리</Button></div>
    </Panel>
    <Panel className="divide-y divide-slate-100 px-5">
      <h2 className="py-4 font-bold">알림 기록</h2>
      {!events.length && <p className="py-6 text-sm text-slate-500">기록이 없습니다.</p>}
      {events.map(event => <article key={event.id} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{kinds[event.kind]}</h3><span className="text-sm text-blue-700">{states[event.state]}{event.state === "failed" ? ` · ${event.attempts}회 시도` : ""}</span></div><p className="mt-1 break-words text-sm text-slate-700">{event.title}</p><p className="mt-2 text-xs text-slate-500">{new Date(event.created_at).toLocaleString("ko-KR")}</p></article>)}
    </Panel>
    <div className="flex justify-between"><Button variant="secondary" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>이전</Button><Button variant="secondary" disabled={events.length < 50} onClick={() => setOffset(offset + 50)}>다음</Button></div>
  </div>;
}
