import type { User } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/server";

export type RequestUser = {
  token: string;
  user: User;
};

export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const token = match[1].trim();
  if (!token) {
    return null;
  }

  const { data, error } = await getServiceSupabase().auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return { token, user: data.user };
}

export function getUserEmail(user: User) {
  return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
}
