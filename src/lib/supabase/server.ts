import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let serviceClient: SupabaseClient<Database, "app_open_vote"> | null = null;
let serviceDbClient: SupabaseClient | null = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
}

export function getServiceSupabase(): SupabaseClient<Database, "app_open_vote"> {
  if (serviceClient) {
    return serviceClient;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server API routes.",
    );
  }

  serviceClient = createClient<Database, "app_open_vote">(url, key, {
    db: { schema: "app_open_vote" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return serviceClient;
}

// New integration tables (api_clients, point_wallets, point_ledger) and new RPCs
// (create_election_with_billing, cast_member_vote, cast_link_vote, charge_points)
// are not yet in the generated database.types.ts (regenerating requires production
// access, which is not available here). This untyped service client lets server
// routes use them without a type regeneration. The app_open_vote schema is still
// applied at runtime.
export function getServiceDbSupabase(): SupabaseClient {
  if (serviceDbClient) {
    return serviceDbClient;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server API routes.",
    );
  }

  // supabase-js (>=2.105) infers the `db.schema` literal ("app_open_vote") into
  // createClient's return type, which no longer matches the schema-agnostic
  // `SupabaseClient` annotation used here and at call sites (e.g. api-key.ts).
  // This client is intentionally untyped (Database = any), so table/RPC access is
  // unaffected — cast back to the plain, untyped SupabaseClient.
  serviceDbClient = createClient(url, key, {
    db: { schema: "app_open_vote" },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient;

  return serviceDbClient;
}

// getAnonSupabase() 는 제거했다. 호출자가 하나도 없었고, app_open_vote 에서
// anon 롤의 권한은 ballots SELECT 하나뿐이므로(20260730000000) 서버에서 공개키
// 클라이언트를 만들 이유가 없다. 공개 조회도 서비스롤 + 라우트 단 검증으로 한다.
