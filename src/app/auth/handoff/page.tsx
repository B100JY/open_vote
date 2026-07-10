import { Suspense } from "react";
import { HandoffClient } from "./handoff-client";

export const dynamic = "force-dynamic";

export default function HandoffPage() {
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
