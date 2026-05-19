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
  title: "신뢰와 보안 | Open Vote",
  description: "Open Vote 투표 시스템이 왜 안전하고 조작 불가능한지 설명합니다.",
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
          Open Vote는 단순한 신뢰를 넘어, 수학적·기술적으로 증명 가능한 투명성을 지향합니다.
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
                  유권자가 "투표했다"는 기록과 "누구에게 투표했나"라는 데이터는 서로 다른 상자에 담깁니다. 
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
                    <span>투표 완료 후 신원 데이터와 기표 데이터는 물리적으로 분리됩니다.</span>
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
            <h2 className="text-2xl font-bold text-slate-950">조작이 불가능한 해시 체인 기술</h2>
          </div>
          <Panel className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">연결된 투표 원장</h3>
                <p className="text-slate-600 leading-relaxed">
                  모든 투표지는 이전 투표지의 지문(해시)을 포함하여 생성됩니다. 
                  마치 체인처럼 엮여 있어, 중간에 투표지 하나를 몰래 바꾸거나 삭제하면 그 뒤에 이어진 모든 체인이 깨지게 됩니다. 
                  이는 블록체인과 동일한 원리로 데이터의 무결성을 보장합니다.
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
                <h3 className="text-lg font-semibold text-slate-900 mb-2">End-to-End Verifiability</h3>
                <p className="text-slate-600 leading-relaxed">
                  투표를 마치면 나만 알 수 있는 디지털 영수증이 발급됩니다. 
                  이 영수증 번호를 통해 선거 종료 후 내 표가 누락되지 않고 정확히 집계에 반영되었는지 직접 검색하여 확인할 수 있습니다.
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
                  <h3 className="text-lg font-semibold text-slate-900">강력한 보안 정책 (RLS)</h3>
                  <p className="text-slate-600">
                    데이터베이스 차원에서 '수정'과 '삭제' 명령이 원천적으로 차단되어 있습니다. 
                    시스템 관리자라 할지라도 한번 제출된 투표지를 바꾸거나 삭제하는 것은 기술적으로 불가능하도록 설계되었습니다.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <Eye className="text-slate-400 shrink-0 mt-1" size={20} />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">실시간 진행 현황 공개</h3>
                  <p className="text-slate-600">
                    누가 누구에게 투표했는지는 비밀이지만, 얼마나 많은 유권자가 참여했는지는 실시간으로 공개됩니다. 
                    집계 과정의 불투명성을 제거하여 모두가 납득할 수 있는 결과를 만들어냅니다.
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
