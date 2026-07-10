"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Alert, Panel } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type EmailOtpType = "magiclink" | "email";

/** 오픈 리다이렉트 방지: 같은 출처의 경로만 허용한다. */
function safeNext(next: string | null): string {
  if (!next) return "/vote";
  if (!next.startsWith("/") || next.startsWith("//")) return "/vote";
  return next;
}

export function HandoffClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const tokenHash = params.get("token_hash") ?? "";
    const type = (params.get("type") as EmailOtpType) || "magiclink";
    const next = safeNext(params.get("next"));

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      return;
    }

    if (!tokenHash) {
      setError("핸드오프 토큰이 없습니다. 노조링크에서 다시 시도해주세요.");
      return;
    }

    let cancelled = false;

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error: verifyError }) => {
        if (cancelled) return;
        if (verifyError) {
          setError("로그인 링크가 만료되었거나 이미 사용되었습니다. 노조링크에서 다시 시도해주세요.");
          return;
        }
        router.replace(next);
      })
      .catch(() => {
        if (!cancelled) {
          setError("로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Panel className="p-6 text-center">
          <AlertTriangle className="mx-auto text-amber-600" size={40} aria-hidden="true" />
          <h1 className="mt-4 text-lg font-semibold text-slate-950">로그인하지 못했습니다</h1>
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <Panel className="p-8">
        <h1 className="text-lg font-semibold text-slate-950">로그인 중…</h1>
        <p className="mt-2 text-sm text-slate-500">노조링크 계정으로 안전하게 연결하고 있습니다.</p>
      </Panel>
    </div>
  );
}
