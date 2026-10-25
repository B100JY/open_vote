"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { setPendingCode } from "@/lib/pending-code";
import { cleanCodeInput } from "@/lib/voter-code-input";

/**
 * 문자로 받은 투표 코드 입력칸. onCode 가 없으면 /c 로 넘어가 투표한다.
 * 코드는 주소창에 싣지 않는다.
 */
export function CodeEntry({
  onCode,
  title = "문자로 받은 투표 코드로 투표하기",
  compact = false,
}: {
  onCode?: (code: string) => void;
  title?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = cleanCodeInput(value);
    if (!code) {
      setError("코드는 영문·숫자 6자리입니다. 문자에 있는 코드를 다시 확인해 주세요.");
      return;
    }
    setError("");
    if (onCode) {
      onCode(code);
      return;
    }
    setPendingCode(code);
    router.push("/c");
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      {!compact ? <h2 className="px-1 text-sm font-semibold text-slate-700">{title}</h2> : null}
      <div className="flex gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">투표 코드</span>
          <KeyRound
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={20}
            aria-hidden="true"
          />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="예: ABC-234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
            className="h-14 w-full rounded-xl border border-[var(--border)] bg-white pl-12 pr-3 text-lg font-semibold uppercase tracking-widest shadow-sm outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <Button type="submit" className="h-14 shrink-0 px-5">
          투표하기
        </Button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
