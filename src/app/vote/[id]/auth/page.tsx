import { AuthClient } from "./auth-client";

export default async function AuthPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AuthClient electionId={id} />;
}
