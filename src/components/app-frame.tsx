import Link from "next/link";
import { ClipboardList, Home, ListChecks, ShieldCheck, UserRound } from "lucide-react";

// 투표·진행률·결과·검증은 홈에서 투표를 찾아 들어간다(/elections/[id]). 메뉴는 최소로 둔다.
const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/admin", label: "투표 생성", icon: ClipboardList },
  { href: "/admin/elections", label: "내 투표 관리", icon: ListChecks },
  { href: "/settings", label: "내 설정", icon: UserRound },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/92 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <ShieldCheck size={22} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold leading-5">
                  모아이
                </span>
                <span className="block text-xs text-slate-500">
                  오픈소스 투표 시스템
                </span>
              </span>
            </Link>
            {/* 휴대폰에서는 메뉴가 넘치므로 내 설정을 오른쪽 위 아이콘으로 둔다. */}
            <Link
              href="/settings"
              aria-label="내 설정"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 sm:hidden"
            >
              <UserRound size={20} aria-hidden="true" />
            </Link>
          </div>

          <nav className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${item.href === "/settings" ? "hidden sm:inline-flex" : "inline-flex"} h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950`}
                >
                  <Icon size={17} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
