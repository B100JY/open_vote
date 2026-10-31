"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import { BallotForm } from "@/components/ballot-form";
import { Button } from "@/components/ui";
import { describeBallotRules, hasApprovalAnswerOptions, type BallotSelection } from "@/lib/ballot";
import type { BallotRules, Candidate } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const CREATION_LOCK_NOTICE = "생성 후에는 투표명·단체명·설명·투표 항목·방식·명부를 변경할 수 없습니다. 생성 전에 미리보기로 확인해주세요.";

/** 실제 투표지 컴포넌트를 사용하되 생성·접수·인증 API는 호출하지 않는다. */
export function ElectionPreview({ name, organizationName, description, descriptionPublic, contentRestricted, candidates, rules, rulesError, startsAt, endsAt, voterCount, smsRequired, onClose, onSimplifyApproval }: {
  name: string; organizationName: string; description: string; descriptionPublic: boolean; contentRestricted: boolean;
  candidates: Candidate[]; rules: BallotRules | null; rulesError?: string;
  startsAt: string; endsAt: string; voterCount: number; smsRequired: boolean; onClose: () => void;
  onSimplifyApproval?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [view, setView] = useState<"voter" | "public">("voter");
  const [selection, setSelection] = useState<BallotSelection | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const date = (value: string) => value && Number.isFinite(Date.parse(value)) ? formatDate(value) : "미정";
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl bg-slate-50 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
      <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold"><Eye size={20} aria-hidden="true" />투표 미리보기</h2>
      <button type="button" onClick={onClose} aria-label="미리보기 닫기" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600"><X size={22} aria-hidden="true" /></button>
    </header>
    <div className="grid gap-4 p-4 sm:p-6">
      <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">현재 입력한 내용으로 보는 미리보기입니다. 항목을 눌러봐도 투표가 생성되거나 제출되지 않습니다.</p>
      <div className="grid grid-cols-2 gap-2" aria-label="미리보기 화면 선택">
        <Button variant={view === "voter" ? "primary" : "secondary"} aria-pressed={view === "voter"} onClick={() => setView("voter")}>참여자 화면</Button>
        <Button variant={view === "public" ? "primary" : "secondary"} aria-pressed={view === "public"} onClick={() => setView("public")}>공개 안내 화면</Button>
      </div>
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-label={view === "voter" ? "참여자 화면 미리보기" : "공개 안내 화면 미리보기"}>
        <div>{organizationName.trim() && <p className="mb-2 text-sm font-medium text-blue-700">{organizationName}</p>}<h3 className="break-words text-2xl font-semibold">{name.trim() || "투표명을 입력해주세요"}</h3>
          {(view === "voter" || (!contentRestricted && descriptionPublic)) && description.trim() ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        <dl className="grid gap-2 text-sm text-slate-600"><div><dt className="font-semibold">투표 기간</dt><dd className="mt-1">{date(startsAt)} ~ {date(endsAt)}</dd></div><div><dt className="inline font-semibold">참여 대상 </dt><dd className="inline">등록된 유권자 {voterCount}명</dd></div></dl>
        {view === "voter" ? <>
          {rules ? <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{describeBallotRules(rules,candidates.length)}</p> : <p className="text-sm text-amber-800">{rulesError || "투표 방식을 확인해주세요."}</p>}
          {rules?.ballot_type === "approve" && hasApprovalAnswerOptions(candidates) && onSimplifyApproval ? <div className="grid gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>‘찬성’과 ‘반대’ 각각에 찬반을 묻는 설정입니다. 한 안건의 찬반을 묻으려면 아래 버튼으로 바꾸세요.</p><Button variant="secondary" onClick={() => {setSelection(null);onSimplifyApproval();}}>찬성·반대 중 하나 선택으로 변경</Button></div> : null}
          {candidates.length && rules ? <BallotForm candidates={candidates} rules={rules} value={selection} onChange={setSelection} /> : <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">투표 항목을 추가하면 실제 투표지 모양을 볼 수 있습니다.</p>}
          {smsRequired && <p className="text-sm text-slate-600">제출 전 등록된 휴대폰으로 문자 인증을 진행합니다.</p>}
          <Button disabled>투표하기 · 미리보기</Button>
        </> : <p className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">{contentRestricted ? "내용과 결과는 투표 링크나 코드를 확인한 사람에게만 공개됩니다." : "내용과 마감 후 결과를 공개합니다."}{!descriptionPublic && " 투표 설명은 공개 화면에 표시하지 않습니다."}</p>}
      </section>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{CREATION_LOCK_NOTICE}</p>
      <Button variant="secondary" onClick={onClose}>닫고 수정하기</Button>
    </div>
  </dialog>;
}
