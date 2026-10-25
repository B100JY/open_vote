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
    // 공유 auth 라 반드시 local: 이 브라우저의 모아이투표 세션만 끝낸다.
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

      {member.role === "admin" ? <SmsTemplateGuide /> : null}

      <Button variant="secondary" onClick={signOut}>
        <LogOut size={17} /> 로그아웃
      </Button>
    </div>
  );
}

// notifier 에 등록할 권장 템플릿. {app_name} 은 notifier 앱 이름, 나머지는 모아이투표가 수신자마다 채운다.
const RECOMMENDED_TEMPLATE = `[{app_name}] {title}
{name}님 투표 링크: {url}
링크가 걱정되면 vote.bluerdot.net 에서 코드 {code} 입력`;

/**
 * 총괄관리자용 안내 문자 템플릿 안내. 템플릿 본문은 notifier 관리 화면에서만 고친다
 * (모아이투표가 notifier 관리자 키를 갖지 않게 하려고 — 키가 새면 모든 앱 템플릿·발송 설정이 바뀔 수 있다).
 */
function SmsTemplateGuide() {
  return (
    <Panel className="p-5">
      <h2 className="text-base font-semibold text-slate-950">안내 문자 템플릿 (총괄관리자)</h2>
      <p className="mt-2 break-keep text-sm leading-6 text-slate-600">
        문자 본문은 발송 서버(notifier)의 템플릿으로 정해집니다. 투표 생성자는 제목만 고칠 수 있고, 본문은 아래
        관리 화면에서 총괄관리자가 고칩니다.
      </p>
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{RECOMMENDED_TEMPLATE}</pre>
      <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-500">
        <li><code>{"{title}"}</code> 문자 제목(생성자 편집, 기본 &ldquo;투표명 투표 안내&rdquo;)</li>
        <li><code>{"{name}"}</code> 유권자 이름 · <code>{"{url}"}</code> 개인 링크 · <code>{"{code}"}</code> 투표 코드(ABC-234)</li>
        <li>이모지는 쓸 수 없습니다. 한글 45자를 넘으면 장문(LMS)으로 나갑니다.</li>
      </ul>
      <a
        href="https://notifier.bluerdot.net/admin"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        notifier 관리 화면에서 템플릿 고치기
      </a>
    </Panel>
  );
}
