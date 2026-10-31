import { AdminGate } from "@/components/admin-gate";
import { VoteCompleteScreen } from "@/components/vote-complete-screen";

export const metadata = {
  title: "투표 완료 화면 미리보기 | 모아이투표 관리자",
  robots: { index: false, follow: false },
};

export default function VoteCompletePreviewPage() {
  return <AdminGate adminOnly><VoteCompleteScreen preview /></AdminGate>;
}
