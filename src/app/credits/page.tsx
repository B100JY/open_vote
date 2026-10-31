"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminGate } from "@/components/admin-gate";
import { Alert, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { fetchJson } from "@/lib/client-fetch";
import type { CreditsSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";
export default function CreditsPage() {
  return (
    <AdminGate>
      <Credits />
    </AdminGate>
  );
}
function Credits() {
  const [data, setData] = useState<CreditsSummary | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void authHeaders()
      .then((headers) => fetchJson<CreditsSummary>("/api/credits", { headers }))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="mx-auto grid max-w-2xl gap-5">
      <h1 className="text-2xl font-bold">내 포인트</h1>
      {error && <Alert>{error}</Alert>}
      <Panel className="grid gap-3 p-6">
        <p className="text-2xl font-bold">
          {data ? `${data.balance.toLocaleString()}P` : "조회 중…"}
        </p>
        <p>
          투표 생성은 무료입니다. 서버 문자 발송·예약 시 잔액을 확인하고 비용을
          사용합니다. 휴대폰 문자 앱으로 직접 보내는 단체문자는 포인트를
          사용하지 않습니다.
        </p>
        <p>
          포인트 충전은 운영자에게 계정 이메일과 필요한 금액을 알려
          요청해주세요. 지급 후 이 화면의 잔액을 확인할 수 있습니다.
        </p>
        {data?.isAdmin && (
          <Link className="text-blue-700 underline" href="/admin/credits">
            관리자 포인트 지급
          </Link>
        )}
      </Panel>
      <Panel className="p-6">
        <h2 className="text-lg font-bold">최근 사용 내역</h2>
        <ul className="divide-y">
          {data?.transactions.map((t) => (
            <li className="py-3" key={t.id}>
              {formatDate(t.created_at)} · {t.amount.toLocaleString()}P
              <p className="text-sm text-slate-600">
                {t.memo || t.tx_type} · 잔액 {t.balance_after.toLocaleString()}P
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
