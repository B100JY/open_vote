"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, Save } from "lucide-react";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { authHeaders } from "@/lib/client-auth";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Member = {
  email: string;
  display_name: string;
  role: "pending" | "creator" | "admin" | "suspended";
  google_linked: boolean;
};

const roleLabel: Record<Member["role"], string> = {
  pending: "승인 대기 — 운영자가 승인하면 투표를 만들 수 있습니다",
  creator: "투표 생성자",
  admin: "관리자",
  suspended: "이용 정지",
};

/** 개인 설정: 계정 정보 확인, 이름 변경, 로그아웃. */
export function SettingsClient() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    authHeaders()
      .then((headers) => (headers.Authorization ? fetch("/api/auth/me", { headers, cache: "no-store" }) : null))
      .then(async (response) => {
        if (!response?.ok) return;
        const result = (await response.json()) as { member: Member };
        setMember(result.member);
        setName(result.member.display_name);
      })
      .catch(() => setError("계정 정보를 불러오지 못했습니다."))
      .finally(() => setChecking(false));
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ displayName: name }),
      });
      const result = (await response.json()) as { member?: Member; error?: string };
      if (!response.ok || !result.member) throw new Error(result.error ?? "저장하지 못했습니다.");
      setMember(result.member);
      setNotice("저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    // 공유 auth 라 반드시 local: 이 브라우저의 모아이 세션만 끝낸다.
    await getBrowserSupabase()?.auth.signOut({ scope: "local" });
    router.push("/");
  }

  if (checking) {
    return <Panel className="mx-auto max-w-md p-6 text-center text-sm text-slate-400">불러오는 중</Panel>;
  }

  if (!member) {
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-950">로그인하지 않았습니다</h1>
        <p className="mt-2 text-sm text-slate-500">설정은 투표를 만드는 회원만 쓸 수 있습니다.</p>
        <Link
          href="/admin"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <LogIn size={17} aria-hidden="true" /> 로그인
        </Link>
      </Panel>
    );
  }

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <h1 className="text-2xl font-semibold text-slate-950">내 설정</h1>

      <Panel className="p-5">
        <h2 className="text-base font-semibold text-slate-950">계정</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-400">이메일</dt>
            <dd className="break-all text-slate-800">{member.email}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-400">로그인</dt>
            <dd className="text-slate-800">{member.google_linked ? "구글 계정" : "이메일·비밀번호"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-slate-400">권한</dt>
            <dd className="break-keep text-slate-800">{roleLabel[member.role]}</dd>
          </div>
        </dl>
        {!member.google_linked ? (
          <p className="mt-3 break-keep text-xs leading-5 text-slate-500">
            구글로 로그인하려면 로그아웃한 뒤 &lsquo;구글 계정으로 시작하기&rsquo;를 누르세요. 같은 이메일의 구글
            계정이면 이 계정으로 그대로 이어집니다.
          </p>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <form className="grid gap-4" onSubmit={save}>
          <Field
            label="이름"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={60}
            required
            autoComplete="name"
            hint="투표를 만든 사람으로 표시되는 이름입니다."
          />
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" disabled={saving || name.trim() === member.display_name}>
            <Save size={17} /> {saving ? "저장 중" : "저장"}
          </Button>
        </form>
      </Panel>

      <Button variant="secondary" onClick={signOut}>
        <LogOut size={17} /> 로그아웃
      </Button>
    </div>
  );
}
