import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function VoteVerificationHint({
  electionId,
  closed,
  confirmed = false,
}: {
  electionId: string;
  closed: boolean;
  confirmed?: boolean;
}) {
  return (
    <aside className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-blue-800">
        <ShieldCheck size={17} className="shrink-0" aria-hidden="true" />
        {confirmed ? "투표 후에는 내 표를 확인해보세요" : "이미 투표하셨나요?"}
      </p>
      <p className="mt-2 text-sm leading-7 text-slate-700">
        {closed ? "투표가 종료되어 " : "투표가 끝난 뒤 "}
        <Link href={`/verify?election=${encodeURIComponent(electionId)}`} className="font-semibold text-blue-700 underline underline-offset-4" aria-label="이곳: 이 투표의 검증 화면">
          이곳
        </Link>
        에서 내 표가 기록되었는지 검증할 수 있습니다.
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-500">투표 완료 화면의 영수증을 준비해주세요. 영수증은 본인만 보관하세요.</p>
    </aside>
  );
}
