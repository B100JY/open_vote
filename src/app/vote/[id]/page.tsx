import { BallotClient } from "./ballot-client";

export default async function BallotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BallotClient electionId={id} />;
}
