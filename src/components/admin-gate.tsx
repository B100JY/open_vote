"use client";

import { Fragment, useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { Alert, Button, Panel } from "@/components/ui";
import { googleErrorMessage } from "@/lib/google-oauth-messages";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Role = "pending" | "creator" | "admin" | "suspended";
type GateState = "checking" | "anonymous" | "pending" | "creator" | "admin" | "forbidden";
type MemberResponse = { member: { email: string; display_name: string; role: Role; email_verified: boolean } };

export function AdminGate({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const [state, setState] = useState<GateState>("checking");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("인증 환경 설정이 누락되었습니다.");
      setState("anonymous");
      return;
    }

    let revision = 0;
    let currentUserId: string | undefined;
    async function check(accessToken: string | undefined, userId?: string) {
      const current = ++revision;
      if (userId !== currentUserId) {
        currentUserId = userId;
        setIdentity(userId ?? "");
        setState("checking");
      }
      if (!accessToken) {
        setState("anonymous");
        return;
      }
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (current !== revision) return;
        if (!response.ok) {
          setState("forbidden");
          return;
        }
        const result = (await response.json()) as MemberResponse;
        setState(result.member.role === "admin" ? "admin" : result.member.role === "creator" ? "creator" : "pending");
      } catch {
        if (current === revision) setState("forbidden");
      }
    }

    // 구글 콜백이 fragment 로 넘긴 1회용 token_hash 로 세션을 연다. 주소창에서는 바로 지운다.
    async function redeemGoogle(): Promise<void> {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const tokenHash = hash.get("gauth");
      const failure = hash.get("gauth_error");
      if (!tokenHash && !failure) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (failure) {
        setError(googleErrorMessage(failure));
        return;
      }
      const { error: otpError } = await supabase!.auth.verifyOtp({ token_hash: tokenHash!, type: "magiclink" });
      if (otpError) setError(googleErrorMessage("server"));
    }

    redeemGoogle()
      .catch(() => setError(googleErrorMessage("server")))
      .then(() => supabase.auth.getSession())
      .then(({ data }) => check(data.session?.access_token,data.session?.user.id))
      .catch(() => setState("anonymous"));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.access_token,session?.user.id);
    });
    return () => { revision++; subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    await getBrowserSupabase()?.auth.signOut({ scope: "local" });
    setState("anonymous");
  }

  if (state === "checking") return (
    <Panel className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">모아이투표 로그인 확인 중</h1>
    </Panel>
  );

  if (state === "admin" || (state === "creator" && !adminOnly)) return <Fragment key={identity}>{children}</Fragment>;

  if (state === "pending" || state === "creator" || state === "forbidden") return (
    <Panel className="mx-auto max-w-md p-6 text-center">
      <ShieldCheck className="mx-auto text-amber-600" size={38} />
      <h1 className="mt-4 text-lg font-semibold">
        {state === "pending" ? "투표 생성 권한이 제한된 계정입니다" : state === "creator" ? "관리자 전용 메뉴" : "모아이투표 회원 정보가 없습니다"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {state === "pending"
          ? "계정 상태는 운영자에게 문의해주세요."
          : state === "creator" ? "선거 생성자 계정입니다. 회원 관리와 포인트 지급은 관리자만 이용할 수 있습니다."
          : "구글 계정으로 다시 시작해 주세요."}
      </p>
      <Button variant="secondary" className="mt-5" onClick={signOut}>
        <LogOut size={17} /> 다른 계정으로 로그인
      </Button>
    </Panel>
  );

  return (
    <Panel className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold text-slate-950">투표를 만들려면 가입해 주세요</h1>
      <p className="mt-2 break-keep text-sm leading-6 text-slate-500">
        투표 만들기와 관리는 가입한 회원만 할 수 있습니다. <br />
        투표 참여는 가입 없이 가능합니다.
      </p>
      <a
        href="/api/auth/google/start"
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-white px-4 text-base font-semibold text-slate-800 transition hover:bg-slate-50"
      >
        <GoogleMark />
        구글 계정으로 시작하기
      </a>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
    </Panel>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
