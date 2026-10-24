import {
  ShieldCheck,
  Lock,
  Link as LinkIcon,
  FileCheck,
  Eye,
  Database,
  CheckCircle2,
  UserX
} from "lucide-react";
import { Badge, Panel } from "@/components/ui";

export const metadata = {
  title: "신뢰와 보안 | 모아이",
  description: "모아이 투표 시스템이 왜 안전하고 조작 불가능한지 설명합니다.",
};

export default function TrustPage() {
  return (
    <div className="mx-auto max-w-4xl py-6 sm:py-10">
      <header className="mb-12 text-center">
        <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-100 px-3 py-1 text-sm">
          Security & Trust
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          믿을 수 있는 투표를 위한 약속
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          모아이은 단순한 신뢰를 넘어, 수학적·기술적으로 증명 가능한 투명성을 지향합니다.
        </p>
      </header>

      <div className="grid gap-8">
        {/* 1. 익명성 보장 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <UserX size={24} />
            </div>
            <h2 className="text-2xl font-bold text-slate-950">투표의 비밀은 철저히 보장됩니다</h2>
          </div>
          <Panel className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">신원과 기표의 분리</h3>
                <p className="text-slate-600 leading-relaxed">
                  유권자가 &ldquo;투표했다&rdquo;는 기록과 &ldquo;누구에게 투표했나&rdquo;라는 데이터는 서로 다른 상자에 담깁니다.
                  두 데이터 사이에는 어떠한 연결 고리도 없으므로, 데이터베이스를 직접 들여다보더라도 누가 무엇을 투표했는지 추적하는 것은 불가능합니다.
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                    <span>투표지 테이블에 사용자 ID나 이메일을 저장하지 않습니다.</span>
                  </li>
                  <li className="flex gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                    <span>명부에는 투표 여부만 남고 투표 시각은 기록하지 않습니다.</span>
                  </li>
                  <li className="flex gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                    <span>투표지에는 순번이나 시각이 없어, 투표한 순서로 두 기록을 맞춰볼 수 없습니다.</span>
                  </li>
                </ul>
              </div>
            </div>
          </Panel>
        </section>

        {/* 2. 조작 방지 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <LinkIcon size={24} />
            </div>
            <h2 className="text-2xl font-bold text-slate-950">마감 후 공개되는 투표 원장</h2>
          </div>
          <Panel className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">원장과 원장 해시</h3>
                <p className="text-slate-600 leading-relaxed">
                  투표가 끝나면 모든 투표지를 영수증 번호 순서로 정렬한 원장과, 원장 전체의 지문(해시)이 공개됩니다.
                  누구나 브라우저에서 지문을 다시 계산해 공개된 원장과 집계가 서로 맞는지 확인할 수 있습니다.
                  진행 중에는 결과와 원장을 관리자에게도 보여주지 않습니다.
                </p>
              </div>
              <div className="bg-slate-50 rounded-lg p-5 border border-slate-100 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-12 border-2 border-slate-300 rounded flex items-center justify-center text-xs text-slate-400 font-mono">HASH A</div>
                  <div className="h-0.5 w-4 bg-slate-300"></div>
                  <div className="h-10 w-12 border-2 border-blue-500 rounded flex items-center justify-center text-xs text-blue-500 font-mono font-bold bg-blue-50">HASH B</div>
                  <div className="h-0.5 w-4 bg-slate-300"></div>
                  <div className="h-10 w-12 border-2 border-slate-300 rounded flex items-center justify-center text-xs text-slate-400 font-mono">HASH C</div>
                </div>
              </div>
            </div>
          </Panel>
        </section>

        {/* 3. 유권자 검증 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileCheck size={24} />
            </div>
            <h2 className="text-2xl font-bold text-slate-950">직접 확인하는 나만의 투표 영수증</h2>
          </div>
          <Panel className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">내 표 확인</h3>
                <p className="text-slate-600 leading-relaxed">
                  투표를 마치면 내 기기에서 만든 영수증 번호가 화면에 나옵니다. 서버에는 이 번호가 누구 것인지 남지 않습니다.
                  선거가 끝난 뒤 공개 원장에서 이 번호를 찾아 내가 고른 내용 그대로 기록되었는지 확인할 수 있습니다.
                </p>
              </div>
              <div className="bg-blue-600 rounded-lg p-5 text-white">
                <div className="text-xs opacity-80 mb-1">나의 투표 영수증 예시</div>
                <div className="font-mono text-sm break-all font-bold">
                  8f3a...c92e
                </div>
                <div className="mt-4 text-[10px] bg-blue-500/50 p-2 rounded">
                  이 번호는 암호화되어 있어 타인은 당신의 투표 내용을 알 수 없지만, 당신은 집계 포함 여부를 확인할 수 있습니다.
                </div>
              </div>
            </div>
          </Panel>
        </section>

        {/* 4. 데이터 불변성 */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Lock size={24} />
            </div>
            <h2 className="text-2xl font-bold text-slate-950">누구도 지울 수 없는 투명한 기록</h2>
          </div>
          <Panel className="p-6">
            <div className="grid gap-6">
              <div className="flex gap-4 items-start">
                <Database className="text-slate-400 shrink-0 mt-1" size={20} />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">수정·삭제 경로 없음</h3>
                  <p className="text-slate-600">
                    앱 화면과 API에는 제출된 투표지를 고치거나 지우는 기능이 없고, 데이터베이스 보안 정책(RLS)도 외부의 수정·삭제를 막습니다.
                    서버 운영자의 데이터베이스 권한까지 기술로 막을 수는 없기 때문에, 그 대신 마감 후 원장 해시와 영수증으로 누구나 확인할 수 있게 했습니다.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Eye className="text-slate-400 shrink-0 mt-1" size={20} />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">참여율만 진행 중 공개</h3>
                  <p className="text-slate-600">
                    진행 중에는 몇 명이 참여했는지만 공개합니다. 항목별 득표는 투표가 마감된 뒤에 한 번에 공개되어,
                    중간 결과가 남은 유권자의 선택에 영향을 주지 않습니다.
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        </section>
      </div>

      <footer className="mt-16 pt-8 border-t border-slate-200 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600 mb-4">
          <ShieldCheck size={28} />
        </div>
        <h3 className="text-xl font-bold text-slate-900">우리의 목표는 단순합니다</h3>
        <p className="mt-2 text-slate-600 max-w-lg mx-auto">
          모든 구성원이 안심하고 자신의 의사를 표현하며, 그 결과에 대해 누구도 의구심을 갖지 않는 투명한 민주주의를 기술로 지원하는 것입니다.
        </p>
      </footer>
    </div>
  );
}
