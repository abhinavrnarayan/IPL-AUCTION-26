"use client";

import { createBrowserClient } from "@supabase/ssr";

import { appConfig, assertBrowserSupabaseEnv } from "@/lib/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: ReturnType<typeof createBrowserClient<any>> | null = null;

export function getSupabaseBrowserClient() {
  assertBrowserSupabaseEnv();

  if (!browserClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browserClient = createBrowserClient<any>(
      appConfig.supabaseUrl,
      appConfig.supabaseAnonKey,
    );
  }

  return browserClient;
}
