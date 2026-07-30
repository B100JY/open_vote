"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, LogOut, Mail, ShieldCheck, Vote } from "lucide-react";
import { Alert, Button, Field, Panel } from "@/components/ui";
import { fetchJson } from "@/lib/client-fetch";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { Election } from "@/lib/types";

type VoterStatus = {
  election: { id: string; name: string; status: string };
  registered: boolean;
  hasVoted: boolean;
  votedAt?: string | null;
  voter?: { email: string };
};

export function AuthClient({ electionId }: { electionId: string }) {
  const router = useRouter();
  const [election, setElection] = useState<Election | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<VoterStatus | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<{ election: Election }>(`/api/elections/${electionId}`)
      .then((data) => setElection(data.election))
      .catch(() => setElection(null));
  }, [electionId]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setChecking(false);
      setError("Supabase 공개 환경 변수가 설정되지 않았습니다.");
      return;
    }

    async function loadStatus(accessToken: string) {
      const data = await fetchJson<VoterStatus>(
        `/api/auth/status?electionId=${electionId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      setStatus(data);
      if (data.voter?.email) {
        setEmail(data.voter.email);
      }
    }

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const accessToken = data.session?.access_token ?? "";
        setSessionToken(accessToken);
        if (accessToken) {
          await loadStatus(accessToken);
        }
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "로그인 상태를 확인하지 못했습니다.");
      })
      .finally(() => setChecking(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const accessToken = session?.access_token ?? "";
      setSessionToken(accessToken);
      if (!accessToken) {
        setStatus(null);
        return;
      }
      loadStatus(accessToken).catch((caught) => {
        setError(caught instanceof Error ? caught.message : "유권자 상태를 확인하지 못했습니다.");
      });
    });

    return () => subscription.unsubscribe();
  }, [electionId]);

  async function submit(event: React.FormEvent) {
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
        options: {
          emailRedirectTo: `${window.location.origin}/vote/${electionId}/auth`,
        },
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
    // scope: "local" 필수. 기본값 "global" 은 공유 auth.users 를 쓰는
    // 노조링크·Cowork 세션까지 전 기기에서 끊는다. 여기는 "다른 이메일로 로그인"
    // (계정 전환)이므로 이 기기만 해제한다. 자세한 배경은 AGENTS.md 참조.
    await supabase?.auth.signOut({ scope: "local" });
    setSessionToken("");
    setStatus(null);
  }

  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <Link
        href="/vote"
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        선거 선택
      </Link>

      <Panel className="p-5 sm:p-6">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">매직 링크 인증</h1>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {election?.name ?? "선거 정보를 불러오는 중입니다."}
            </p>
          </div>
        </div>

        {checking ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            로그인 상태를 확인하는 중입니다.
          </div>
        ) : sessionToken && status?.registered ? (
          <div className="grid gap-4">
            <Alert tone={status.hasVoted ? "success" : "info"}>
              {status.hasVoted
                ? "투표 완료 상태입니다. 같은 계정으로는 다시 투표할 수 없습니다."
                : "투표 전 상태입니다. 이제 투표지를 열 수 있습니다."}
            </Alert>
            <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-4 text-sm">
              <div className="font-semibold text-slate-950">{status.voter?.email}</div>
              <div className="mt-1 text-slate-500">
                {status.hasVoted ? "참여 상태: 투표 완료" : "참여 상태: 투표 전"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!status.hasVoted ? (
                <Button onClick={() => router.replace(`/vote/${electionId}`)}>
                  <Vote size={18} aria-hidden="true" />
                  투표지 열기
                </Button>
              ) : (
                <Link
                  href="/vote/complete"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  완료 화면 보기
                </Link>
              )}
              <Button variant="secondary" onClick={signOut}>
                <LogOut size={18} aria-hidden="true" />
                로그아웃
              </Button>
            </div>
          </div>
        ) : sessionToken && status && !status.registered ? (
          <div className="grid gap-4">
            <Alert>이 이메일은 현재 선거의 유권자 명부에 없습니다.</Alert>
            <Button variant="secondary" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" />
              다른 이메일로 로그인
            </Button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submit}>
            <Field
              label="이메일"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="voter@example.com"
              autoComplete="email"
            />

            {sent ? (
              <Alert tone="success">
                입력한 이메일로 일회용 로그인 링크를 보냈습니다.
              </Alert>
            ) : null}

            {error ? <Alert>{error}</Alert> : null}

            <Button type="submit" disabled={loading}>
              <Mail size={18} aria-hidden="true" />
              {loading ? "발송 중" : "매직 링크 받기"}
            </Button>
          </form>
        )}
      </Panel>

      <Alert tone="info">
        로그인 링크는 Supabase Auth가 이메일로 직접 발송하며, 관리자는 링크나
        비밀번호를 볼 수 없습니다.
      </Alert>
    </div>
  );
}
