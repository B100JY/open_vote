import { AdminGate } from "@/components/admin-gate";
import { MockElectionLab } from "@/components/mock-election-lab";
export const metadata = { title: "모의 선거 테스트실 | 모아이투표", robots: { index: false, follow: false } };
export default function MockElectionLabPage() {
  return <AdminGate adminOnly><MockElectionLab /></AdminGate>;
}
