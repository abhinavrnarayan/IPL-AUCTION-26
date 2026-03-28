export const appConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  /** Prefer legacy anon key; publishable default key is supported for newer Supabase projects. */
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

export const hasBrowserSupabaseEnv = Boolean(
  appConfig.supabaseUrl && appConfig.supabaseAnonKey,
);

export const hasServiceRoleEnv =
  hasBrowserSupabaseEnv && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

export function assertBrowserSupabaseEnv() {
  if (!hasBrowserSupabaseEnv) {
    throw new Error(
      "Missing Supabase browser environment variables. Copy .env.example to .env.local and fill in your project keys.",
    );
  }
}

export function assertServiceRoleEnv() {
  if (!hasServiceRoleEnv) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Server-side room mutations require the service role key.",
    );
  }
}
