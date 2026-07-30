"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { isAdminUser } from "@/lib/admin-role";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type GateState = "checking" | "anonymous" | "forbidden" | "admin";

/**
 * Supabase 로그인 에러를 사용자용 한국어 메시지로 변환합니다.
 */
function toLoginError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "";

  if (/invalid login credentials/i.test(message)) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (/email not confirmed/i.test(message)) {
    return "이메일 인증이 완료되지 않은 계정입니다.";
  }
  if (message) {
    return message;
  }
  return "로그인에 실패했습니다.";
}

/**
 * 관리자 전용 페이지를 감싸는 게이트.
 * - 비로그인: 이메일·비밀번호 로그인 폼 표시
 * - 로그인했으나 admin 권한 없음: 안내 + 로그아웃
 * - admin: children 렌더링
 *
 * 클라이언트 게이트는 UX용이며, 실제 인가는 서버의 requireAdmin이 강제합니다.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const user = session?.user as Parameters<typeof isAdminUser>[0];
      if (!user) {
        setState("anonymous");
        return;
      }
      setState(isAdminUser(user) ? "admin" : "forbidden");
    }

    supabase.auth
      .getSession()
      .then(({ data }) => evaluate(data.session))
      .catch(() => setState("anonymous"));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        throw new Error("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        throw new Error("이메일과 비밀번호를 모두 입력해주세요.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      // 성공 시 onAuthStateChange가 세션을 반영해 admin/forbidden 상태로 전환합니다.
      setPassword("");
    } catch (caught) {
      setError(toLoginError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = getBrowserSupabase();
    // scope: "local" 필수. signOut() 의 기본값은 "global" 이고, 이 Supabase
    // 프로젝트의 auth.users 는 노조링크·Cowork 와 공유하므로 기본값으로 부르면
    // 이 버튼 하나가 그 사용자의 다른 앱 세션까지 전 기기에서 끊는다.
    // 여기는 "다른 계정으로 로그인"(계정 전환)이므로 이 기기만 해제하면 된다.
    await supabase?.auth.signOut({ scope: "local" });
    setPassword("");
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
        <h1 className="mt-4 text-lg font-semibold">관리자 권한이 없습니다</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          현재 계정에는 관리자 권한이 없습니다. 관리자 권한이 있는 계정으로 다시
          로그인해주세요.
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
          <h1 className="text-lg font-semibold text-slate-950">관리자 로그인</h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            관리 기능은 관리자 계정의 이메일과 비밀번호로 로그인해야 사용할 수 있습니다.
          </p>
        </div>
      </div>

      <form className="grid gap-4" onSubmit={signIn}>
        <Field
          label="관리자 이메일"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          placeholder="admin@example.com"
          autoComplete="username"
        />

        <Field
          label="비밀번호"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
        />

        {error ? <Alert>{error}</Alert> : null}

        <Button type="submit" disabled={loading}>
          <LogIn size={18} aria-hidden="true" />
          {loading ? "로그인 중" : "로그인"}
        </Button>
      </form>
    </Panel>
  );
}
