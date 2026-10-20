"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Coins } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";

/** 독립형 투표에 사용하는 개인 지갑만 관리합니다. 노조링크 조합 지갑은 잠정 중단. */
export default function CreditsPage() {
  return (
    <AdminGate adminOnly>
      <OwnerCreditGrant />
    </AdminGate>
  );
}

function OwnerCreditGrant() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setError("");
    try {
      const data = await fetchJson<{ success: true; balance: number }>("/api/admin/credits/grant", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ email: email.trim(), amount: Number(amount), memo }),
      });
      setNotice(`처리 완료. 현재 잔액 ${data.balance.toLocaleString()}P`);
      setAmount("");
      setMemo("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "포인트 지급에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <Link href="/admin" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700">
        <ArrowLeft size={16} aria-hidden="true" />
        투표 관리
      </Link>
      <Panel className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Coins size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">독립형 투표 포인트 지급</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              다모음에서 직접 생성하는 선거의 개인 포인트 잔액을 관리합니다.
              외부 앱 연동 키 및 노조링크 조합 지갑 관리는 잠정 중단했습니다.
            </p>
          </div>
        </div>
        <form className="grid gap-4" onSubmit={grant}>
          <Field
            label="지급 대상 회원 이메일"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="member@example.com"
          />
          <Field
            label="포인트 (음수면 차감)"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="1000"
          />
          <Field
            label="지급 사유 (선택)"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="포인트 지급"
          />
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={loading || !email.trim() || !amount || Number(amount) === 0}>
            <Coins size={18} aria-hidden="true" />
            {loading ? "처리 중" : "포인트 지급"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
