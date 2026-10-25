"use client";

import { useCallback, useState } from "react";
import { CodeEntry } from "@/components/code-entry";
import { SmsBallot, type SmsVoteStatus } from "@/components/sms-ballot";
import { Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { takePendingCode } from "@/lib/pending-code";

/** 투표 코드 입력 → 기표. 코드는 이 화면의 메모리에만 있다. */
export function CodeBallotClient() {
  const [code, setCode] = useState<string | null>(() => takePendingCode());

  const load = useCallback(
    () =>
      fetchJson<SmsVoteStatus>("/api/vote/code/status", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    [code],
  );

  if (!code) {
    return (
      <div className="mx-auto grid max-w-xl gap-4">
        <Panel className="p-6">
          <h1 className="text-xl font-semibold text-slate-950">투표 코드 입력</h1>
          <p className="mt-2 break-keep text-sm leading-6 text-slate-600">
            문자에 있는 6자리 코드를 입력하세요. 링크를 누르지 않아도 여기서 바로 투표할 수 있습니다.
          </p>
          <div className="mt-4">
            <CodeEntry compact onCode={setCode} />
          </div>
          <p className="mt-3 text-xs text-slate-400">모아이투표 공식 주소는 vote.bluerdot.net 입니다.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <SmsBallot
        key={code}
        load={load}
        notice="문자로 받은 투표 코드로 본인 확인되었습니다."
        invalidTitle="투표 코드를 확인할 수 없습니다"
        expiredBody="코드를 다시 받으려면 투표 안내 화면의 '코드를 잃어버렸어요'를 이용하세요."
        againBody="이 코드로는 다시 투표할 수 없습니다."
        submit={(selection, receiptHash) =>
          fetchJson<{ success: true; receiptHash: string }>("/api/vote/code", {
            method: "POST",
            body: JSON.stringify({ code, selection, receiptHash }),
          })
        }
      />
      <button
        type="button"
        onClick={() => setCode(null)}
        className="mx-auto text-sm text-slate-500 underline underline-offset-2"
      >
        다른 코드 입력
      </button>
    </div>
  );
}
