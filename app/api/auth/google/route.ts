import { NextResponse } from "next/server";

import { getLoginAuthErrorCode } from "@/lib/auth-errors";
import { appConfig, hasBrowserSupabaseEnv } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/lobby";

  if (!hasBrowserSupabaseEnv) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("authError", "supabase_not_configured");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  const redirectTo = new URL("/auth/callback", appConfig.appUrl);
  redirectTo.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.toString(),
    },
  });

  if (error || !data.url) {
    const errorCode = getLoginAuthErrorCode(error?.message);
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("authError", errorCode);
    loginUrl.searchParams.set("next", next);

    console.error("Failed to start Google OAuth.", {
      error: error?.message ?? "Missing redirect URL from Supabase.",
      errorCode,
    });

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(data.url);
}
