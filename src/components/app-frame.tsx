import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Home,
  LayoutDashboard,
  ShieldCheck,
  Vote,
} from "lucide-react";

const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/vote", label: "투표", icon: Vote },
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/results", label: "결과", icon: BarChart3 },
  { href: "/verify", label: "검증", icon: ShieldCheck },
  { href: "/admin", label: "관리", icon: ClipboardList },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/92 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold leading-5">
                Open Vote
              </span>
              <span className="block text-xs text-slate-500">
                노동조합용 오픈소스 투표 시스템
              </span>
            </span>
          </Link>

          <nav className="flex gap-1 overflow-x-auto pb-1 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
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
