import { getServiceSupabase } from "@/lib/supabase/server";
import {
  blockStatus,
  nextFailureState,
  type RateLimitSnapshot,
} from "@/lib/rate-limit-window";

type RateLimitRow = {
  id: number;
  attempt_count: number;
  blocked_until: string | null;
  last_attempt_at: string | null;
};

function toSnapshot(row: RateLimitRow): RateLimitSnapshot {
  return {
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptAtMs: row.last_attempt_at
      ? new Date(row.last_attempt_at).getTime()
      : null,
    blockedUntilMs: row.blocked_until
      ? new Date(row.blocked_until).getTime()
      : null,
  };
}

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

    const blockedUntilMs = data?.blocked_until
      ? new Date(data.blocked_until).getTime()
      : null;

    return blockStatus(blockedUntilMs, Date.now());
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

    const decision = nextFailureState(
      data ? toSnapshot(data) : null,
      Date.now(),
    );

    if (!data) {
      await supabase.from("rate_limits").insert({
        ip_address: ipAddress,
        endpoint,
        attempt_count: decision.attemptCount,
        last_attempt_at: new Date(decision.lastAttemptAtMs).toISOString(),
        blocked_until: decision.blockedUntilMs
          ? new Date(decision.blockedUntilMs).toISOString()
          : null,
      });
      return;
    }

    await supabase
      .from("rate_limits")
      .update({
        attempt_count: decision.attemptCount,
        last_attempt_at: new Date(decision.lastAttemptAtMs).toISOString(),
        blocked_until: decision.blockedUntilMs
          ? new Date(decision.blockedUntilMs).toISOString()
          : null,
      })
      .eq("id", data.id);
  } catch {
    // Rate limiting should never prevent the core voting flow from returning.
  }
}
