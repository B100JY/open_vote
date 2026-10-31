import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MoaiIcon } from "@/components/moai-icon";
import { SiteNav } from "@/components/site-nav";

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <a href="#main-content" className="skip-link">본문으로 바로가기</a>
      <header className="site-header">
        <div className="site-container header-inner">
          <Link href="/" className="brand" aria-label="모아이투표 홈">
            <span className="brand-mark"><MoaiIcon width={34} height={34} /></span>
            <span className="text-xl font-bold tracking-[-0.07em]">모아이투표</span>
          </Link>
          <SiteNav />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="site-container site-main flex-1">
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-container flex flex-col gap-5 py-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="font-bold tracking-tight text-slate-800">모아이투표</Link>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">각자의 선택이 모여, 우리의 결정으로.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-600">
            <Link href="/trust" className="inline-flex items-center gap-1">보안과 투명성 <ArrowUpRight size={13} aria-hidden="true" /></Link>
            <Link href="/verify">투표 검증</Link>
            <Link href="/privacy">개인정보처리방침</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
