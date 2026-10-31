import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Coins, UsersRound, ListChecks, Bell, Eye } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Panel } from "@/components/ui";

export default function AdminManagePage() {
  return <AdminGate adminOnly>
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><ArrowLeft size={16} aria-hidden="true"/>홈으로</Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">관리자</h1>
        <p className="mt-2 text-base text-slate-500">회원의 투표 생성 권한과 포인트를 관리합니다.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/admin/members" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
          <Panel className="h-full p-6 transition-colors group-hover:border-blue-300">
            <UsersRound className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
            <h2 className="flex items-center justify-between text-lg font-semibold">회원 관리<ArrowUpRight size={18} aria-hidden="true"/></h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">가입 회원과 이용 정지·해제를 관리합니다. 가입 즉시 투표를 만들 수 있습니다.</p>
          </Panel>
        </Link>
        <Link href="/admin/credits" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
          <Panel className="h-full p-6 transition-colors group-hover:border-blue-300">
            <Coins className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
            <h2 className="flex items-center justify-between text-lg font-semibold">포인트 관리<ArrowUpRight size={18} aria-hidden="true"/></h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">충전 내역을 확인한 뒤 회원에게 문자 발송용 포인트를 지급합니다.</p>
          </Panel>
        </Link>
      </div>
      <Link href="/admin/preview/sandbox" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
        <Panel className="p-6 transition-colors group-hover:border-blue-300">
          <Eye className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
          <h2 className="flex items-center justify-between text-lg font-semibold">모의 선거 테스트실<ArrowUpRight size={18} aria-hidden="true"/></h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">임의 코드로 투표하고 실제 화면의 완료·결과·영수증·원장 검증을 시험합니다. 운영 선거에는 영향이 없습니다.</p>
        </Panel>
      </Link>
      <Link href="/admin/preview/vote-complete" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
        <Panel className="p-6 transition-colors group-hover:border-blue-300">
          <Eye className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
          <h2 className="flex items-center justify-between text-lg font-semibold">투표 완료 화면 미리보기<ArrowUpRight size={18} aria-hidden="true"/></h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">실제 투표 없이 완료 화면과 영수증 안내를 확인합니다.</p>
        </Panel>
      </Link>
      <Link href="/admin/notifications" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
        <Panel className="p-6 transition-colors group-hover:border-blue-300">
          <Bell className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
          <h2 className="flex items-center justify-between text-lg font-semibold">알림 관리<ArrowUpRight size={18} aria-hidden="true"/></h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">구글챗 알림을 켜고 끄거나 가입·생성·투표 접수 기록을 확인합니다.</p>
        </Panel>
      </Link>
      <Link href="/admin/manage/elections" className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
        <Panel className="p-6 transition-colors group-hover:border-blue-300">
          <ListChecks className="mb-5 text-blue-600" size={28} aria-hidden="true"/>
          <h2 className="flex items-center justify-between text-lg font-semibold">전체 투표 관리<ArrowUpRight size={18} aria-hidden="true"/></h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">모든 생성자의 투표를 확인합니다. 내 투표 관리에는 본인이 만든 투표만 표시됩니다.</p>
        </Panel>
      </Link>
    </div>
  </AdminGate>;
}
