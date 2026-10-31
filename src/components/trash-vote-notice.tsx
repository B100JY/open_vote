"use client";
import { useState } from "react";
import { Alert, Button, Panel, Textarea } from "./ui";
import { fetchJson } from "@/lib/client-fetch";
import { formatDate } from "@/lib/utils";
export function TrashVoteNotice({
  purgeAfter,
  held,
  credential,
}: {
  purgeAfter?: string | null;
  held?: boolean;
  credential?: {
    body: Record<string, string>;
    headers?: Record<string, string>;
  };
}) {
  const [reason, setReason] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Panel className="mx-auto grid max-w-xl gap-4 p-6">
      <h1 className="text-xl font-bold">이 투표는 삭제 대기 중입니다</h1>
      <p>
        {held || saved
          ? "이의제기가 접수되어 자동 삭제가 보류되었습니다."
          : `${formatDate(purgeAfter)} 이후 삭제 예정입니다. 삭제 전까지 이의를 제기할 수 있습니다.`}
      </p>
      <p>
        휴지통에서는 투표에 참여할 수 없습니다. 보관 중인 영수증과 검증 자료는
        따로 저장해주세요.
      </p>
      {credential && !saved && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await fetchJson("/api/vote/objection", {
                method: "POST",
                headers: credential.headers,
                body: JSON.stringify({ ...credential.body, reason }),
              });
              setSaved(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "접수하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Textarea
            label="삭제 이의제기 사유"
            required
            minLength={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            이의제기 · 자동 삭제 보류
          </Button>
        </form>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Panel>
  );
}
