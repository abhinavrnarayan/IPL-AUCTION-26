"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getLoginAuthErrorCode,
  sanitizeNextPath,
} from "@/lib/auth-errors";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { syncUserProfileFromAuthUser } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function buildAuthRedirect({
  page,
  authError,
  authNotice,
  next,
}: {
  page: "/login" | "/signup" | "/login/reset";
  authError?: string;
  authNotice?: string;
  next: string;
}) {
  const searchParams = new URLSearchParams();

  if (authError) {
    searchParams.set("authError", authError);
  }

  if (authNotice) {
    searchParams.set("authNotice", authNotice);
  }

  if (next !== "/lobby") {
    searchParams.set("next", next);
  }

  const query = searchParams.toString();
  return query ? `${page}?${query}` : page;
}

/** @deprecated use buildAuthRedirect */
function buildLoginRedirect(args: { authError?: string; authNotice?: string; next: string }) {
  return buildAuthRedirect({ page: "/login", ...args });
}

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInWithPasswordAction(formData: FormData) {
  const next = sanitizeNextPath(getFormValue(formData, "next"));

  if (!hasBrowserSupabaseEnv) {
    redirect(buildLoginRedirect({ authError: "supabase_not_configured", next }));
  }

  const email = getFormValue(formData, "email").trim().toLowerCase();
  const password = getFormValue(formData, "password");

  if (!email || !password) {
    redirect(buildLoginRedirect({ authError: "missing_credentials", next }));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect(
      buildLoginRedirect({
        authError: getLoginAuthErrorCode(error?.message, "credential_auth_failed"),
        next,
      }),
    );
  }

  await syncUserProfileFromAuthUser(data.user);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPasswordAction(formData: FormData) {
  const resetRedirect = (args: { authError?: string; authNotice?: string }) =>
    buildAuthRedirect({ page: "/login/reset", next: "/lobby", ...args });

  if (!hasBrowserSupabaseEnv) {
    redirect(resetRedirect({ authError: "supabase_not_configured" }));
  }

  const email = getFormValue(formData, "email").trim().toLowerCase();

  if (!email) {
    redirect(resetRedirect({ authError: "missing_credentials" }));
  }

  const supabase = await createSupabaseServerClient();
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/auth/callback?next=/lobby`,
  });

  if (error) {
    const code = error.message?.toLowerCase().includes("rate")
      ? "reset_rate_limited"
      : "reset_failed";
    redirect(resetRedirect({ authError: code }));
  }

  redirect(resetRedirect({ authNotice: "password_reset_sent" }));
}

export async function signUpWithPasswordAction(formData: FormData) {
  const next = sanitizeNextPath(getFormValue(formData, "next"));

  if (!hasBrowserSupabaseEnv) {
    redirect(buildAuthRedirect({ page: "/signup", authError: "supabase_not_configured", next }));
  }

  const username = getFormValue(formData, "username").trim();
  const email = getFormValue(formData, "email").trim().toLowerCase();
  const password = getFormValue(formData, "password");
  const passwordConfirm = getFormValue(formData, "passwordConfirm");

  if (!username || !email || !password) {
    redirect(buildAuthRedirect({ page: "/signup", authError: "missing_credentials", next }));
  }

  if (password.length < 6) {
    redirect(buildAuthRedirect({ page: "/signup", authError: "password_too_short", next }));
  }

  if (password !== passwordConfirm) {
    redirect(buildAuthRedirect({ page: "/signup", authError: "password_mismatch", next }));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: username,
        name: username,
        user_name: username,
      },
    },
  });

  if (error || !data.user) {
    redirect(
      buildAuthRedirect({
        page: "/signup",
        authError: getLoginAuthErrorCode(error?.message, "credential_auth_failed"),
        next,
      }),
    );
  }

  if (data.session) {
    await syncUserProfileFromAuthUser(data.user);
    redirect(next);
  }

  redirect(buildAuthRedirect({ page: "/signup", authNotice: "check_email", next }));
}
