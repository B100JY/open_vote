import { ElectionHub } from "./election-hub";

export default async function ElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ElectionHub electionId={id} />;
}
