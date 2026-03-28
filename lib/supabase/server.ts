import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { appConfig, assertBrowserSupabaseEnv } from "@/lib/config";

export async function createSupabaseServerClient() {
  assertBrowserSupabaseEnv();

  const cookieStore = await cookies();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies, which is fine here.
        }
      },
    },
  });
}
