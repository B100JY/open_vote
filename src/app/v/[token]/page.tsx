import { LinkBallotClient } from "./link-ballot-client";

export default async function LinkVotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LinkBallotClient token={token} />;
}
