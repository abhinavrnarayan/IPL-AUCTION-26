import { createClient } from "@supabase/supabase-js";

import { appConfig, assertServiceRoleEnv } from "@/lib/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = ReturnType<typeof createClient<any>>;
let adminClient: AnySupabaseClient | null = null;

export function getSupabaseAdminClient() {
  assertServiceRoleEnv();

  if (!adminClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminClient = createClient<any>(
      appConfig.supabaseUrl,
      appConfig.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return adminClient!;
}
