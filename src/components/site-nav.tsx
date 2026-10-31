"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const items = [
  { href: "/", label: "홈" },
  { href: "/admin/elections", label: "내 투표 관리" },
  { href: "/contacts", label: "명부·단체문자" },
  { href: "/settings", label: "내 설정" },
  { href: "/trust", label: "이용 안내" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    let live = true, revision = 0;
    let checkedToken: string | null | undefined;
    const controller = new AbortController();
    async function check(token?: string) {
      const value = token ?? null;
      if (value === checkedToken) return;
      checkedToken = value;
      const request = ++revision;
      if (live) setSignedIn(Boolean(token));
      if (live) setIsAdmin(false);
      if (!token) { if (live) setIsAdmin(false); return; }
      try {
        const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        const result = response.ok ? await response.json() : null;
        if (live && request === revision) setIsAdmin(result?.member?.role === "admin");
      } catch { if (live && request === revision) setIsAdmin(false); }
    }
    // INITIAL_SESSION과 getSession의 중복 조회는 같은 토큰으로 묶는다. 폴링하지 않는다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void check(session?.access_token); });
    void supabase.auth.getSession().then(({ data }) => check(data.session?.access_token)).catch(() => check());
    return () => { live = false; revision++; controller.abort(); subscription.unsubscribe(); };
  }, []);
  async function signOut() {
    const supabase = getBrowserSupabase();
    if (!supabase || signingOut) return;
    setSigningOut(true); setLogoutError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setSignedIn(false); setIsAdmin(false);
      router.replace("/");
      router.refresh();
    } catch { setLogoutError("로그아웃하지 못했습니다. 다시 시도해주세요."); }
    finally { setSigningOut(false); }
  }
  const adminActive = ["/admin/manage", "/admin/members", "/admin/credits", "/admin/notifications"].some(path => pathname === path || pathname.startsWith(`${path}/`));
  return (
    <nav aria-label="주 메뉴" className="site-nav">
      <div className="nav-links">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? "page" : undefined}>
              {item.label}
            </Link>
          );
        })}
        {isAdmin ? <Link href="/admin/manage" className="nav-link" aria-current={adminActive ? "page" : undefined}>관리자</Link> : null}
      </div>
      <div className="nav-actions">
      {signedIn ? <button type="button" aria-label="로그아웃" title="로그아웃" disabled={signingOut} onClick={() => void signOut()} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"><LogOut size={20} aria-hidden="true" /></button> : <Link href="/admin" aria-label="로그인" title="로그인" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <LogIn size={20} aria-hidden="true" />
      </Link>}
      <Link href="/admin" className="nav-admin" aria-current={pathname === "/admin" ? "page" : undefined}>
        투표 생성 <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
      </div>
      {logoutError ? <p role="alert" className="text-xs text-red-700">{logoutError}</p> : null}
    </nav>
  );
}
