import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { hasBrowserSupabaseEnv, hasServiceRoleEnv } from "@/lib/config";
import { AppError } from "@/lib/domain/errors";
import type { UserProfile } from "@/lib/domain/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingSupabaseTableError } from "@/lib/supabase/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mapAuthUser(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      user.user_metadata.full_name ??
      user.user_metadata.name ??
      user.user_metadata.user_name ??
      null,
    avatarUrl: user.user_metadata.avatar_url ?? null,
  };
}

export async function syncUserProfileFromAuthUser(user: User) {
  if (!hasServiceRoleEnv) {
    return mapAuthUser(user);
  }

  const admin = getSupabaseAdminClient();
  const profile = {
    id: user.id,
    email: user.email ?? null,
    display_name:
      user.user_metadata.full_name ??
      user.user_metadata.name ??
      user.user_metadata.user_name ??
      null,
    avatar_url: user.user_metadata.avatar_url ?? null,
  };

  const { error } = await admin.from("users").upsert(profile);

  if (error) {
    if (isMissingSupabaseTableError(error.message)) {
      return mapAuthUser(user);
    }

    throw new AppError(error.message, 500, "USER_SYNC_FAILED");
  }

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  } satisfies UserProfile;
}

export async function getSessionUser() {
  if (!hasBrowserSupabaseEnv) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (!hasServiceRoleEnv) {
    return mapAuthUser(user);
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("users")
    .select("id, email, display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingSupabaseTableError(error.message)) {
      return mapAuthUser(user);
    }

    throw new AppError(error.message, 500, "USER_FETCH_FAILED");
  }

  if (!profile) {
    return syncUserProfileFromAuthUser(user);
  }

  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
  } satisfies UserProfile;
}

export async function requireSessionUser() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireApiUser() {
  if (!hasBrowserSupabaseEnv) {
    throw new AppError("Supabase auth is not configured.", 500, "MISSING_SUPABASE_ENV");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AppError("Authentication required.", 401, "UNAUTHORIZED");
  }

  return user;
}
