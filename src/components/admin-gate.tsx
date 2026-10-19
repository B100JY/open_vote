"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Role = "pending" | "creator" | "admin" | "suspended";
type GateState = "checking" | "anonymous" | "pending" | "creator" | "admin" | "forbidden";
type SessionResponse = { access_token: string; refresh_token: string };
type MemberResponse = { member: { email: string; display_name: string; role: Role; email_verified: boolean } };

export function AdminGate({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const [state, setState] = useState<GateState>("checking");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError("인증 환경 설정이 누락되었습니다.");
      setState("anonymous");
      return;
    }

    let revision = 0;
    async function check(accessToken: string | undefined) {
      const current = ++revision;
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

    supabase.auth.getSession().then(({ data }) => check(data.session?.access_token)).catch(() => setState("anonymous"));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.access_token);
    });
    return () => { revision++; subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const supabase = getBrowserSupabase();
      if (!supabase) throw new Error("로그인을 사용할 수 없습니다.");
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) throw new Error("이메일과 비밀번호를 입력해주세요.");

      if (mode === "register") {
        const registered = await fetch("/api/auth/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, password, name, inviteCode }),
        });
        const result = (await registered.json()) as { error?: string; message?: string };
        if (!registered.ok) throw new Error(result.error ?? "회원가입에 실패했습니다.");
        setNotice(result.message ?? "가입되었습니다.");
      }

      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
        cache: "no-store",
      });
      const result = (await response.json()) as SessionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "로그인에 실패했습니다.");
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.access_token, refresh_token: result.refresh_token,
      });
      if (sessionError) throw new Error("로그인 세션을 저장하지 못했습니다.");
      setPassword("");
      setInviteCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청 처리에 실패했습니다.");
    } finally { setLoading(false); }
  }

  async function signOut() {
    await getBrowserSupabase()?.auth.signOut({ scope: "local" });
    setPassword("");
    setState("anonymous");
  }

  if (state === "checking") return (
    <Panel className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">OpenVote 로그인 확인 중</h1>
    </Panel>
  );

  if (state === "admin" || (state === "creator" && !adminOnly)) return <>{children}</>;

  if (state === "pending" || state === "creator" || state === "forbidden") return (
    <Panel className="mx-auto max-w-md p-6 text-center">
      <ShieldCheck className="mx-auto text-amber-600" size={38} />
      <h1 className="mt-4 text-lg font-semibold">
        {state === "pending" ? "가입 완료 · 선거 생성 승인 대기" : state === "creator" ? "관리자 전용 메뉴" : "OpenVote 전용 계정이 필요합니다"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {state === "pending"
          ? "계정은 생성되었습니다. 관리자가 선거 생성자 권한을 승인하면 투표를 만들 수 있습니다."
          : state === "creator" ? "선거 생성자 계정입니다. 회원 승인과 포인트 지급은 관리자만 이용할 수 있습니다."
          : "다른 서비스 계정은 OpenVote에 자동으로 연결되지 않습니다. OpenVote에 별도로 가입해 주세요."}
      </p>
      <Button variant="secondary" className="mt-5" onClick={signOut}>
        <LogOut size={17} /> 다른 계정으로 로그인
      </Button>
    </Panel>
  );

  return (
    <Panel className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold text-slate-950">
        {mode === "register" ? "OpenVote 회원가입" : "OpenVote 로그인"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        다른 서비스 계정과 별도로 운영됩니다. 투표 유권자는 가입하지 않고 개인 링크로 참여할 수 있습니다.
      </p>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        {mode === "register" ? (
          <Field label="이름" value={name} onChange={(e) => setName(e.target.value)}
            minLength={2} maxLength={60} required autoComplete="name" />
        ) : null}
        <Field label="이메일" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="username" required />
        <Field label="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"} required
          hint={mode === "register" ? "8자 이상. 현재 메일 인증·비밀번호 자동 재설정은 제공되지 않습니다." : undefined} />
        {mode === "register" ? (
          <Field label="회원가입 초대코드" type="password" value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)} minLength={16} required
            hint="운영자가 별도로 전달한 초대코드입니다. 투표 유권자에게는 필요하지 않습니다." />
        ) : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" disabled={loading}>
          {mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
          {loading ? "처리 중" : mode === "register" ? "가입하고 로그인" : "로그인"}
        </Button>
        <Button variant="secondary" onClick={() => {
          setMode(mode === "login" ? "register" : "login"); setError(""); setNotice("");
        }}>
          {mode === "login" ? "새 OpenVote 계정 만들기" : "기존 계정으로 로그인"}
        </Button>
      </form>
    </Panel>
  );
}
