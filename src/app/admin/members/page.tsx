"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Badge, Button, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";

type Member = { id: string; email: string; display_name: string; role: string; email_verified: boolean; created_at: string };

export default function MembersPage() {
  return <AdminGate adminOnly><MembersList /></AdminGate>;
}

function MembersList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const response = await fetch("/api/admin/members", { headers: await authHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error("회원 목록을 확인하지 못했습니다.");
    const data = (await response.json()) as { members: Member[] };
    setMembers(data.members);
  }

  useEffect(() => {
    let live = true;
    const fetchMembers = async () => {
      try { await load(); }
      catch (caught) { if (live) setError(caught instanceof Error ? caught.message : "조회 오류"); }
    };
    void fetchMembers();
    return () => { live = false; };
  }, []);

  async function verifyIdentity(member: Member) {
    if (!window.confirm(`${member.display_name} 회원의 이메일 소유 및 실제 신원을 별도 수단(대면 등)으로 확인했습니까?`)) return;
    setError(""); setNotice(""); setBusyId(member.id);
    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ verifyIdentity: true, attestation: "confirmed_in_person" }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "본인확인 기록 실패");
      await load();
      setNotice(`${member.display_name} 회원의 본인확인을 기록했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "본인확인 기록 실패");
    } finally { setBusyId(""); }
  }

  async function approve(member: Member, role: "pending" | "creator" | "suspended") {
    if (role === "suspended" && !window.confirm(`${member.display_name} 회원을 이용 정지할까요?`)) return;
    setError(""); setNotice(""); setBusyId(member.id);
    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "권한 변경 실패");
      await load();
      setNotice(`${member.display_name} 회원의 권한을 변경했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "권한 변경 실패");
    } finally { setBusyId(""); }
  }

  return (
    <div className="grid gap-5">
      <Link href="/admin" className="text-sm font-semibold text-blue-700">← 투표 관리</Link>
      <Panel className="p-5 sm:p-6">
        <h1 className="text-xl font-semibold">OpenVote 회원 승인</h1>
        <p className="mt-2 text-sm text-slate-600">
          새 가입자는 권한 대기 상태입니다. 신청자의 신원을 확인한 뒤 선거 생성자로 승인하세요.
          서비스 관리자는 보안상 이 화면에서 신규 지정할 수 없습니다.
        </p>
        {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
        {notice ? <div className="mt-4"><Alert tone="success">{notice}</Alert></div> : null}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead><tr className="border-b text-slate-500">
              <th className="p-2">회원</th><th className="p-2">이메일</th><th className="p-2">권한</th><th className="p-2">조치</th>
            </tr></thead>
            <tbody>{members.map((member) => (
              <tr className="border-b" key={member.id}>
                <td className="p-2">{member.display_name}</td>
                <td className="p-2">{member.email}{!member.email_verified ? " (미인증)" : ""}</td>
                <td className="p-2"><Badge>{member.role}</Badge></td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-2">
                    {!member.email_verified && member.role !== "admin" ? (
                      <Button variant="secondary" disabled={busyId === member.id}
                        onClick={() => verifyIdentity(member)}>본인확인 기록</Button>
                    ) : null}
                    {member.role === "pending" || member.role === "suspended" ? (
                      <Button variant="secondary" disabled={busyId === member.id || !member.email_verified}
                        title={!member.email_verified ? "본인확인 후 별도 운영 절차로 인증 상태를 처리해야 합니다." : undefined}
                        onClick={() => approve(member, "creator")}>생성자 승인</Button>
                    ) : null}
                    {member.role === "creator" ? (
                      <Button variant="secondary" disabled={busyId === member.id}
                        onClick={() => approve(member, "pending")}>승인 해제</Button>
                    ) : null}
                    {member.role !== "admin" && member.role !== "suspended" ? (
                      <Button variant="danger" disabled={busyId === member.id}
                        onClick={() => approve(member, "suspended")}>이용 정지</Button>
                    ) : null}
                  </div>
                </td>
              </tr>))}</tbody>
          </table>
          {members.length === 0 ? <p className="py-6 text-sm text-slate-500">회원이 없거나 목록을 불러오는 중입니다.</p> : null}
        </div>
      </Panel>
    </div>
  );
}
