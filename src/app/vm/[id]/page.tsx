import { MemberBallotClient } from "./member-ballot-client";

export default async function MemberBallotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemberBallotClient electionId={id} />;
}
