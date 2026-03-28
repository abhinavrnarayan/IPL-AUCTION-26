"use client";

import { createBrowserClient } from "@supabase/ssr";

import { appConfig, assertBrowserSupabaseEnv } from "@/lib/config";

export const createClient = () => {
  assertBrowserSupabaseEnv();

  return createBrowserClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
};
