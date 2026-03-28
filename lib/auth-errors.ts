export type LoginAuthErrorCode =
  | "provider_not_enabled"
  | "supabase_not_configured"
  | "oauth_start_failed"
  | "missing_credentials"
  | "invalid_credentials"
  | "email_not_confirmed"
  | "password_auth_not_enabled"
  | "email_taken"
  | "credential_auth_failed";

export type LoginAuthNoticeCode =
  | "account_created"
  | "check_email";

export function sanitizeNextPath(next?: string | null) {
  return typeof next === "string" && next.startsWith("/") ? next : "/lobby";
}

export function getLoginAuthErrorCode(
  errorMessage?: string,
  fallback: LoginAuthErrorCode = "credential_auth_failed",
): LoginAuthErrorCode {
  const normalizedMessage = errorMessage?.toLowerCase() ?? "";

  if (
    normalizedMessage.includes("provider is not enabled") ||
    normalizedMessage.includes("unsupported provider")
  ) {
    return "provider_not_enabled";
  }

  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid email or password")
  ) {
    return "invalid_credentials";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "email_not_confirmed";
  }

  if (
    normalizedMessage.includes("email logins are disabled") ||
    normalizedMessage.includes("signups not allowed for otp") ||
    normalizedMessage.includes("password sign") ||
    normalizedMessage.includes("password login")
  ) {
    return "password_auth_not_enabled";
  }

  if (
    normalizedMessage.includes("user already registered") ||
    normalizedMessage.includes("already been registered")
  ) {
    return "email_taken";
  }

  return fallback;
}

export function getLoginAuthErrorMessage(errorCode?: string | null) {
  switch (errorCode) {
    case "provider_not_enabled":
      return "Google sign-in is disabled for this Supabase project. Enable the Google provider in Supabase Auth, then try again.";
    case "supabase_not_configured":
      return "Supabase auth is not configured yet. Add the required values to .env.local and restart the app.";
    case "missing_credentials":
      return "Enter both email and password before submitting the form.";
    case "invalid_credentials":
      return "That email/password combination did not match an account.";
    case "email_not_confirmed":
      return "This account still needs email confirmation before it can sign in.";
    case "password_auth_not_enabled":
      return "Email/password auth is disabled in Supabase Auth. Enable the email provider to use this fallback.";
    case "email_taken":
      return "That email address is already registered. Try signing in instead.";
    case "credential_auth_failed":
      return "Email/password auth could not be completed. Check your Supabase auth settings and try again.";
    case "oauth_start_failed":
      return "Unable to start Google sign-in. Check the Supabase auth provider settings and redirect configuration.";
    default:
      return null;
  }
}

export function getLoginAuthNoticeMessage(noticeCode?: string | null) {
  switch (noticeCode) {
    case "account_created":
      return "Account created and signed in successfully.";
    case "check_email":
      return "Account created. Check your inbox if this Supabase project requires email confirmation before sign-in.";
    default:
      return null;
  }
}
