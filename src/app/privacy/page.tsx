import { Panel } from "@/components/ui";

export const metadata = {
  title: "개인정보처리방침 | 모아이투표",
  description: "모아이투표가 어떤 개인정보를 왜 받고 어떻게 다루는지 설명합니다.",
};

const sections: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "1. 받는 정보와 쓰는 곳",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>투표를 만드는 회원</strong> — 구글 계정의 이메일, 이름, 구글 계정 식별번호. 로그인과 회원 관리,
          포인트 관리에만 씁니다. 구글 비밀번호는 받지 않습니다.
        </li>
        <li>
          <strong>유권자 명부</strong> — 투표를 만든 회원이 올린 이름과 휴대전화번호(또는 이메일). 투표 링크를 보내고
          한 사람이 두 번 투표하지 못하게 하는 데만 씁니다. 유권자는 가입하지 않습니다.
        </li>
        <li>
          <strong>투표 내용</strong> — 무엇을 골랐는지는 이름·전화번호와 따로 저장하며, 둘을 잇는 값을 남기지 않습니다.
          일반 관리 화면에는 개인 선택을 표시하지 않습니다. 서버·DB에 접근하는 운영자의 연결 가능성까지 암호학적으로 차단하는 방식은 아닙니다.
        </li>
        <li><strong>연락처 명부·그룹</strong> — 생성자가 저장한 이름·전화번호·그룹 소속을 계정별로 보관합니다. 휴대폰 단체문자는 선택한 수신자와 본문을 해당 기기의 문자 앱에 전달하고, 생성자가 직접 전송합니다.</li>
      </ul>
    ),
  },
  {
    title: "2. 보관 기간",
    body: (
      <p>
        회원 정보는 탈퇴를 요청할 때까지 보관합니다. 연락처 명부는 생성자가 삭제할 때까지 보관하며, 이미 생성된 투표의 명부와는 별개입니다. 투표 전체는 휴지통으로 옮긴 뒤 60일간 보관하고 이의제기가 없으면 자동 삭제합니다. 이의제기가 접수되면 자료를 보존합니다. 과금 거래 내역은 투표 자료와 별도로 보존합니다.
      </p>
    ),
  },
  {
    title: "3. 처리를 맡기는 곳",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase — 데이터베이스 보관</li>
        <li>Vercel — 웹사이트 운영</li>
        <li>문자 발송 사업자(알리고, 솔라피) — 투표 링크 문자 발송</li>
        <li>Google — 구글 계정 로그인</li>
      </ul>
    ),
  },
  {
    title: "4. 제3자 제공",
    body: <p>법령에 따른 요구가 있는 경우를 빼고 다른 곳에 제공하지 않습니다. 광고에 쓰지 않습니다.</p>,
  },
  {
    title: "5. 열람·정정·삭제 요청과 문의",
    body: (
      <p>
        본인 정보의 열람·정정·삭제나 그 밖의 문의는{" "}
        <a className="font-semibold text-blue-700 underline" href="mailto:b100jy@gmail.com">
          b100jy@gmail.com
        </a>
        으로 보내 주세요. 유권자 명부에 관한 요청은 그 투표를 만든 단체에 먼저 해 주셔도 됩니다.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <h1 className="text-2xl font-semibold text-slate-950">개인정보처리방침</h1>
      <p className="text-sm text-slate-500">수정일 2026년 10월 29일</p>
      {sections.map((section) => (
        <Panel key={section.title} className="break-keep p-5 text-sm leading-7 text-slate-700">
          <h2 className="mb-2 text-base font-semibold text-slate-950">{section.title}</h2>
          {section.body}
        </Panel>
      ))}
    </div>
  );
}
