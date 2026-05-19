import { getServiceSupabase } from "@/lib/supabase/server";

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

type RateLimitRow = {
  id: number;
  attempt_count: number;
  blocked_until: string | null;
  last_attempt_at: string | null;
};

export async function checkRateLimit(ipAddress: string, endpoint: string) {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("rate_limits")
      .select("id, attempt_count, blocked_until, last_attempt_at")
      .eq("ip_address", ipAddress)
      .eq("endpoint", endpoint)
      .order("last_attempt_at", { ascending: false })
      .limit(1)
      .maybeSingle<RateLimitRow>();

    if (!data?.blocked_until) {
      return { blocked: false, remainingSeconds: 0 };
    }

    const blockedUntil = new Date(data.blocked_until).getTime();
    const now = Date.now();

    if (blockedUntil <= now) {
      return { blocked: false, remainingSeconds: 0 };
    }

    return {
      blocked: true,
      remainingSeconds: Math.ceil((blockedUntil - now) / 1000),
    };
  } catch {
    return { blocked: false, remainingSeconds: 0 };
  }
}

export async function recordFailedAttempt(ipAddress: string, endpoint: string) {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("rate_limits")
      .select("id, attempt_count, blocked_until, last_attempt_at")
      .eq("ip_address", ipAddress)
      .eq("endpoint", endpoint)
      .order("last_attempt_at", { ascending: false })
      .limit(1)
      .maybeSingle<RateLimitRow>();

    if (!data) {
      await supabase.from("rate_limits").insert({
        ip_address: ipAddress,
        endpoint,
        attempt_count: 1,
        last_attempt_at: new Date().toISOString(),
      });
      return;
    }

    const nextCount = Number(data.attempt_count ?? 0) + 1;
    const shouldBlock = nextCount >= MAX_ATTEMPTS;

    await supabase
      .from("rate_limits")
      .update({
        attempt_count: nextCount,
        last_attempt_at: new Date().toISOString(),
        blocked_until: shouldBlock
          ? new Date(Date.now() + BLOCK_DURATION_MS).toISOString()
          : data.blocked_until,
      })
      .eq("id", data.id);
  } catch {
    // Rate limiting should never prevent the core voting flow from returning.
  }
}
