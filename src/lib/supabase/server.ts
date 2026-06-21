import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let serviceClient: SupabaseClient<Database, "app_open_vote"> | null = null;
let anonClient: SupabaseClient<Database, "app_open_vote"> | null = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
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

export function getAnonSupabase(): SupabaseClient<Database, "app_open_vote"> {
  if (anonClient) {
    return anonClient;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required for public reads.",
    );
  }

  anonClient = createClient<Database, "app_open_vote">(url, key, {
    db: { schema: "app_open_vote" },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return anonClient;
}
