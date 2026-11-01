"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileCheck2,
  Fingerprint,
  LockKeyhole,
  Pause,
  Play,
  Smartphone,
  Trash2,
  Users,
} from "lucide-react";
import { GuidePicture } from "./guide-picture";

const voterSteps = [
  {
    kind: "participate",
    title: "문자에서 투표 열기",
    description: "받은 링크나 코드를 열고 선택하세요.",
  },
  {
    kind: "receipt",
    title: "검증이 필요하면 영수증 저장",
    description: "선택 사항이에요. 저장하지 않아도 투표는 완료돼요.",
  },
  {
    kind: "verify",
    title: "마감 후 내 표 확인",
    description: "확인하고 싶다면 ‘투표 검증’에서 저장한 파일을 여세요.",
  },
] as const;
const creatorSteps = [
  {
    kind: "contacts",
    title: "명부·그룹 준비",
    description: "연락처를 등록하고 받을 그룹을 고르세요.",
  },
  {
    kind: "create",
    title: "투표 만들기",
    description: "항목과 기간을 정하세요. 생성은 무료예요.",
  },
  {
    kind: "send",
    title: "시작하고 안내하기",
    description: "내 투표 관리에서 시작하세요. 비용은 문자 발송비만 들어요.",
    price: "1인당 단문 10원 · 장문 30원",
  },
] as const;

export function VisualGuide() {
  const [creator, setCreator] = useState(false);
  return (
    <div className="mx-auto max-w-5xl">
      <header className="text-center">
        <p className="text-sm font-semibold text-blue-600">
          그림으로 보는 이용 안내
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
          {creator
            ? "함께 결정할 준비, 세 단계면 돼요."
            : "투표할 때, 이 세 가지만 기억하세요."}
        </h1>
        <div
          className="mx-auto mt-6 flex w-fit max-w-full gap-1 rounded-full border border-slate-200 bg-white p-1"
          aria-label="안내 대상 선택"
        >
          <button
            type="button"
            aria-pressed={!creator}
            onClick={() => setCreator(false)}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition sm:text-base ${!creator ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            투표에 참여해요
          </button>
          <button
            type="button"
            aria-pressed={creator}
            onClick={() => setCreator(true)}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition sm:text-base ${creator ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            투표를 만들어요
          </button>
        </div>
      </header>
      <section
        className="mt-8"
        aria-label={creator ? "투표 생성 세 단계" : "투표 참여 세 단계"}
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {(creator ? creatorSteps : voterSteps).map((step, i) => (
            <li
              key={step.kind}
              className="relative grid grid-cols-[104px_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[150px_1fr] md:block md:p-5"
            >
              <div className="h-28 rounded-xl bg-slate-50 sm:h-32 md:h-40">
                <GuidePicture kind={step.kind} />
              </div>
              <div className="md:mt-4">
                <span className="text-xs font-bold tracking-wider text-blue-600">
                  0{i + 1}
                </span>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
                {"price" in step && (
                  <p className="mt-2 text-sm font-semibold leading-6 text-blue-700">
                    {step.price}
                  </p>
                )}
              </div>
              {i < 2 && (
                <ArrowRight
                  className="absolute -right-3 top-20 z-10 hidden rounded-full bg-white p-1 text-blue-500 md:block"
                  size={26}
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
      </section>
      {creator ? <CreatorSummary /> : <VoterSummary />}
      <section
        className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 sm:px-6"
        aria-label="자주 묻는 질문"
        key={creator ? "creator-questions" : "voter-questions"}
      >
        <h2 className="py-5 text-lg font-bold text-slate-900">
          궁금한 것만 펼쳐보세요
        </h2>
        {creator ? (
          <>
            <Answer title="문자 비용은 언제 내나요?">
              투표 생성은 무료입니다. 서비스로 안내 문자를 발송·예약할 때 비용과
              잔액을 확인합니다. 내 휴대폰 문자 앱으로 보내는 단체문자는 모아이
              포인트를 쓰지 않으며 휴대폰 요금제가 적용됩니다.
            </Answer>
            <Answer title="시작일 변경·일시중지는 어디서 하나요?">
              ‘내 투표 관리’에서 시작일은 첫 투표 접수 전까지 바꿀 수 있습니다.
              진행 중에는 일시중지·재개할 수 있습니다. 중지해도 마감일은
              유지되고, 종료한 투표는 다시 열 수 없습니다.
            </Answer>
            <Answer title="휴지통으로 옮기면 어떻게 되나요?">
              참여가 중단되고 60일간 보관합니다. 투표자는 기존 코드·링크로
              이의를 제기할 수 있고, 이의제기가 있으면 자동 삭제를 보류합니다.
              필요한 결과·검증 자료는 삭제 전에 저장해주세요.
            </Answer>
          </>
        ) : (
          <>
            <Answer title="영수증을 꼭 저장해야 하나요?">
              아니요. 영수증은 나중에 내 표를 검증할 때 쓰는 선택 자료입니다.
              받거나 저장하지 않아도 투표할 수 있습니다. 재발급되지 않으니
              검증하고 싶다면 투표 후 저장해주세요.
            </Answer>
            <Answer title="누가 무엇을 골랐는지 볼 수 있나요?">
              참여 여부와 선택 내용은 따로 보관합니다.
              서비스에서는 누가 무엇을 선택했는지 조회할 수 없습니다.
            </Answer>
            <Answer title="검증으로 무엇을 확인하나요?">
              영수증으로 내 표의 누락·변경을 확인하고, 공개된 표로 결과를 다시
              계산할 수 있습니다. 영수증에 포함된 디지털 도장·서명 기준점과 비교하면
              기록의 변조 여부와 집계 결과의 일치 여부도 검증할 수 있습니다.
            </Answer>
            <Answer title="삭제 대기 중인 투표에 이의가 있어요">
              기존 투표 코드나 개인 링크를 열어 ‘삭제 이의제기’에 사유를
              남기세요. 접수되면 자동 삭제가 보류됩니다.
            </Answer>
          </>
        )}
      </section>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-semibold">
        <Link
          className="rounded-xl bg-blue-600 px-5 py-3 text-white"
          href={creator ? "/admin" : "/"}
        >
          {creator ? "투표 만들기" : "투표하러 가기"}
          <ArrowRight size={16} className="ml-2 inline" aria-hidden="true" />
        </Link>
        <Link
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-slate-700"
          href={creator ? "/contacts" : "/verify"}
        >
          {creator ? "명부 관리" : "투표 검증 열기"}
        </Link>
      </div>
    </div>
  );
}

function VoterSummary() {
  return (
    <>
      <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-blue-800">
        <LockKeyhole size={17} className="shrink-0" aria-hidden="true" />
        저장한 영수증은 나만 보관하세요. 공유하면 선택이 드러날 수 있어요.
      </p>
      <section
        className="mt-8 grid gap-4 sm:grid-cols-2"
        aria-label="결과 공개와 기록 확인"
      >
        <div className="rounded-2xl bg-blue-50 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">
            결과는 마감 후에 열려요
          </h2>
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <div>
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border-[7px] border-blue-200 border-t-blue-600 text-blue-700">
                <Users size={26} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-semibold">투표 중</p>
              <p className="mt-1 text-sm text-slate-600">참여율만</p>
            </div>
            <ArrowRight
              size={20}
              className="text-blue-400"
              aria-hidden="true"
            />
            <div>
              <div className="mx-auto flex h-20 w-20 items-end justify-center gap-2 rounded-xl bg-white px-4 pb-4">
                <span className="h-6 w-3 rounded-t bg-blue-200" />
                <span className="h-12 w-3 rounded-t bg-blue-600" />
                <span className="h-9 w-3 rounded-t bg-blue-300" />
              </div>
              <p className="mt-3 text-sm font-semibold">마감 후</p>
              <p className="mt-1 text-sm text-slate-600">득표·결과 공개</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">
            내 표가 잘 남았는지 확인해요
          </h2>
          <ol className="mt-5 grid grid-cols-3 gap-2 text-center">
            <li><div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-white text-emerald-700"><FileCheck2 size={30} aria-hidden="true" /></div><p className="mt-3 text-xs font-semibold text-emerald-700">01 · 투표 후</p><p className="mt-1 text-sm font-semibold">영수증 저장</p><p className="mt-1 text-xs text-slate-600">원할 때만</p></li>
            <li><div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-white text-emerald-700"><Fingerprint size={30} aria-hidden="true" /></div><p className="mt-3 text-xs font-semibold text-emerald-700">02 · 마감 후</p><p className="mt-1 text-sm font-semibold">기록과 대조</p><p className="mt-1 text-xs text-slate-600">검증 화면에 파일 열기</p></li>
            <li><div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-emerald-600 text-white"><Check size={32} aria-hidden="true" /></div><p className="mt-3 text-xs font-semibold text-emerald-700">03 · 검증 결과</p><p className="mt-1 text-sm font-semibold">포함·변경 확인</p><p className="mt-1 text-xs text-slate-600">내 표와 집계 살펴보기</p></li>
          </ol>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white/80 p-3 text-xs text-emerald-900"><span className="rounded border border-emerald-200 px-2 py-1">내 영수증</span><ArrowRight size={16} aria-hidden="true"/><span className="rounded border border-emerald-200 px-2 py-1">마감된 투표 기록</span></div>
          <p className="mt-3 text-center text-xs leading-5 text-slate-600">같은 기록이 남아 있는지, 결과가 맞게 계산됐는지 대조해요.</p>
        </div>
      </section>
    </>
  );
}

function CreatorSummary() {
  return (
    <>
      <section
        className="mt-5 grid gap-3 sm:grid-cols-2"
        aria-label="두 가지 문자 발송 방법"
      >
        <div className="flex items-start gap-3 rounded-2xl bg-blue-50 p-5">
          <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
            <Check size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold">서비스로 투표 안내</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              개인 링크·코드 발송
              <br />
              발송 전 포인트·비용 확인
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-5">
          <Smartphone
            size={25}
            className="mt-1 shrink-0 text-emerald-700"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-bold">내 휴대폰으로 단체문자</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              그룹 선택 → 30명씩 문자 앱 열기
              <br />
              직접 전송 · 휴대폰 요금제 적용
            </p>
          </div>
        </div>
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <span className="flex items-center gap-1">
          <Play size={16} aria-hidden="true" />
          시작
        </span>
        <ArrowRight size={15} aria-hidden="true" />
        <span className="flex items-center gap-1">
          <Pause size={16} aria-hidden="true" />
          중지·재개
        </span>
        <span className="mx-1 text-slate-300">|</span>
        <span className="flex items-center gap-1">
          <Trash2 size={16} aria-hidden="true" />
          휴지통
        </span>
        <ArrowRight size={15} aria-hidden="true" />
        <span>60일 보관</span>
      </div>
    </>
  );
}
function Answer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-slate-100 py-4">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 sm:text-base [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          size={18}
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
        {children}
      </p>
    </details>
  );
}
