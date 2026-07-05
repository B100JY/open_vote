"use client";

import { useEffect, useState } from "react";
import { LogOut, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { isVoteCreator } from "@/lib/admin-role";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type GateState = "checking" | "anonymous" | "forbidden" | "admin";

/**
 * 관리 페이지(투표 생성·선거 관리·포인트)를 감싸는 게이트.
 * - 비로그인: 매직 링크 로그인 폼 표시
 * - 로그인했으나 권한(admin/creator) 없음: 안내 + 로그아웃
 * - admin 또는 creator: children 렌더링
 *
 * 클라이언트 게이트는 UX용이며, 실제 인가는 서버의 requireAdmin /
 * requireVoteCreator가 강제합니다.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      setState("anonymous");
      return;
    }

    function evaluate(session: { user?: unknown } | null) {
      const user = session?.user as Parameters<typeof isVoteCreator>[0];
      if (!user) {
        setState("anonymous");
        return;
      }
      setState(isVoteCreator(user) ? "admin" : "forbidden");
    }

    supabase.auth
      .getSession()
      .then(({ data }) => evaluate(data.session))
      .catch(() => setState("anonymous"));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSent(false);
      evaluate(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSent(false);

    try {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        throw new Error("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        throw new Error("이메일을 입력해주세요.");
      }

      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { emailRedirectTo: window.location.href },
      });

      if (signInError) {
        throw signInError;
      }

      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "매직 링크 발송에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = getBrowserSupabase();
    await supabase?.auth.signOut();
    setState("anonymous");
  }

  if (state === "checking") {
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">관리자 권한 확인 중</h1>
        <p className="mt-2 text-sm text-slate-500">로그인 상태를 확인하고 있습니다.</p>
      </Panel>
    );
  }

  if (state === "admin") {
    return <>{children}</>;
  }

  if (state === "forbidden") {
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto text-amber-600" size={40} aria-hidden="true" />
        <h1 className="mt-4 text-lg font-semibold">투표 생성 권한이 없습니다</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          현재 계정에는 투표 생성 권한(관리자 또는 생성자)이 없습니다. 권한이
          있는 계정으로 다시 로그인하거나 운영자에게 권한을 요청해주세요.
        </p>
        <Button variant="secondary" className="mt-5" onClick={signOut}>
          <LogOut size={18} aria-hidden="true" />
          다른 계정으로 로그인
        </Button>
      </Panel>
    );
  }

  return (
    <Panel className="mx-auto max-w-md p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <ShieldCheck size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-950">관리 로그인</h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            투표 생성·관리 기능은 매직 링크로 로그인한 권한 계정(관리자/생성자)만
            사용할 수 있습니다.
          </p>
        </div>
      </div>

      <form className="grid gap-4" onSubmit={sendMagicLink}>
        <Field
          label="이메일"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="admin@example.com"
          autoComplete="email"
        />

        {sent ? (
          <Alert tone="success">입력한 이메일로 로그인 링크를 보냈습니다.</Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" disabled={loading}>
          <Mail size={18} aria-hidden="true" />
          {loading ? "발송 중" : "매직 링크 받기"}
        </Button>
      </form>
    </Panel>
  );
}
