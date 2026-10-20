import { Suspense } from "react";
import { HandoffClient } from "./handoff-client";
import { isNozolinkIntegrationEnabled } from "@/lib/nozolink-integration";

export const dynamic = "force-dynamic";

export default function HandoffPage() {
  if (!isNozolinkIntegrationEnabled()) {
    return (
      <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-lg font-semibold">노조링크 연동 중단</h1>
        <p className="mt-3 text-sm text-slate-600">
          현재는 독립 서비스로 운영합니다. 다모음에서 직접 로그인하고 투표를 관리해주세요.
        </p>
      </section>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-8 text-center text-sm text-slate-500">
          로그인 정보를 확인하는 중입니다.
        </div>
      }
    >
      <HandoffClient />
    </Suspense>
  );
}
