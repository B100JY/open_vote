import Link from "next/link";
import { ArrowDown, FileCheck2, Fingerprint, ScrollText, ShieldCheck } from "lucide-react";

export const metadata = { title: "검증용 자료 안내 | 모아이투표" };

export default function VerificationGuidePage() {
  return <div className="mx-auto max-w-3xl">
    <h1 className="text-2xl font-bold">검증용 자료, 어디에 쓰나요?</h1>
    <p className="mt-3 leading-7 text-slate-600">투표 기록이 나중에도 그대로인지 확인할 때 쓰는 자료입니다. 모두 선택 사항이며, 저장하지 않아도 투표할 수 있습니다.</p>
    <ol className="mt-6 grid gap-3">
      <li className="rounded-2xl border border-slate-200 bg-white p-5"><ScrollText className="text-blue-600" size={28} aria-hidden="true" /><h2 className="mt-3 font-semibold">투표 전 · 시작 규칙 저장</h2><p className="mt-2 text-sm leading-6 text-slate-600">투표 항목과 진행 규칙을 담은 파일입니다. 나중에 공개된 규칙과 같은지 비교할 수 있습니다.</p></li>
      <li className="rounded-2xl border border-slate-200 bg-white p-5"><Fingerprint className="text-blue-600" size={28} aria-hidden="true" /><h2 className="mt-3 font-semibold">투표 중 · 현재 기준점 저장</h2><p className="mt-2 text-sm leading-6 text-slate-600">저장한 순간의 기록 상태를 확인하는 파일입니다. 이후 기록이 그 기준점에서 이어지는지 비교할 수 있습니다.</p></li>
      <li className="rounded-2xl border border-slate-200 bg-white p-5"><FileCheck2 className="text-emerald-600" size={28} aria-hidden="true" /><h2 className="mt-3 font-semibold">투표 후 · 영수증 저장</h2><p className="mt-2 text-sm leading-6 text-slate-600">투표할 때 받은 확인값을 암호로 잠가 보관합니다. 선거가 끝난 뒤 암호를 입력해 내 표가 그대로 기록됐는지 확인할 수 있습니다.</p></li>
    </ol>
    <div className="mt-5 rounded-2xl bg-emerald-50 p-5 text-center"><p className="font-semibold">저장한 파일</p><ArrowDown className="mx-auto my-3 text-emerald-600" aria-hidden="true" /><p className="font-semibold">마감 후 ‘투표 검증’에서 열기</p><ArrowDown className="mx-auto my-3 text-emerald-600" aria-hidden="true" /><p className="inline-flex items-center gap-2 font-semibold text-emerald-800"><ShieldCheck aria-hidden="true" />공개 기록과 비교</p><p className="mt-3 text-sm leading-6 text-slate-600">저장한 영수증과 암호로 내 표가 공개 기록에 있고 선택이 바뀌지 않았는지 확인합니다. 모든 부정을 막거나 증명하는 기능은 아닙니다.</p></div>
    <p className="mt-5 text-sm leading-6 text-slate-600">영수증은 선택 사항입니다. 저장할 때 암호를 설정하고 기억해 두세요. 파일이나 암호를 다른 사람에게 알려주지 마세요.</p>
    <div className="mt-6 flex flex-wrap gap-4"><Link href="/verify" className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">투표 검증 열기</Link><Link href="/trust" className="rounded-xl border border-slate-200 px-4 py-3 font-semibold">이용 안내</Link></div>
  </div>;
}
