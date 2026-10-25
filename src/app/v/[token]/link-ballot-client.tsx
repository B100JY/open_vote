"use client";

import { useCallback } from "react";
import { SmsBallot, type SmsVoteStatus } from "@/components/sms-ballot";
import { fetchJson } from "@/lib/client-fetch";

/** sms_token(문자 1회용 링크) 투표 화면. 세션 없이 토큰만으로 기표한다. */
export function LinkBallotClient({ token }: { token: string }) {
  const load = useCallback(
    () => fetchJson<SmsVoteStatus>(`/api/vote/link?token=${encodeURIComponent(token)}`),
    [token],
  );
  return (
    <SmsBallot
      load={load}
      notice="문자로 받은 개별 링크로 본인 확인되었습니다."
      submit={(selection, receiptHash) =>
        fetchJson<{ success: true; receiptHash: string }>("/api/vote/link", {
          method: "POST",
          body: JSON.stringify({ token, selection, receiptHash }),
        })
      }
    />
  );
}
