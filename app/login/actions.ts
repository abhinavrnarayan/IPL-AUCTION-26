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

function buildLoginRedirect({
  authError,
  authNotice,
  next,
}: {
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
  return query ? `/login?${query}` : "/login";
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

export async function signUpWithPasswordAction(formData: FormData) {
  const next = sanitizeNextPath(getFormValue(formData, "next"));

  if (!hasBrowserSupabaseEnv) {
    redirect(buildLoginRedirect({ authError: "supabase_not_configured", next }));
  }

  const username = getFormValue(formData, "username").trim();
  const email = getFormValue(formData, "email").trim().toLowerCase();
  const password = getFormValue(formData, "password");

  if (!username || !email || !password) {
    redirect(buildLoginRedirect({ authError: "missing_credentials", next }));
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
      buildLoginRedirect({
        authError: getLoginAuthErrorCode(error?.message, "credential_auth_failed"),
        next,
      }),
    );
  }

  if (data.session) {
    await syncUserProfileFromAuthUser(data.user);
    redirect(next);
  }

  redirect(buildLoginRedirect({ authNotice: "check_email", next }));
}
