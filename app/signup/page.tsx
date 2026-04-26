import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteLogo } from "@/components/site-logo";

import {
  getLoginAuthErrorMessage,
  getLoginAuthNoticeMessage,
  sanitizeNextPath,
} from "@/lib/auth-errors";
import { signUpWithPasswordAction } from "@/app/login/actions";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { getSessionUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Create Account | SFL Fantasy IPL",
  description: "Create your SFL account to join a fantasy IPL auction room and build your team.",
  alternates: { canonical: "/signup" },
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/lobby");

  const resolvedSearchParams = (await searchParams) ?? {};
  const authErrorParam = resolvedSearchParams.authError;
  const authNoticeParam = resolvedSearchParams.authNotice;
  const nextParam = resolvedSearchParams.next;

  const authError =
    typeof authErrorParam === "string" ? getLoginAuthErrorMessage(authErrorParam) : null;
  const authNotice =
    typeof authNoticeParam === "string" ? getLoginAuthNoticeMessage(authNoticeParam) : null;
  const next = sanitizeNextPath(typeof nextParam === "string" ? nextParam : null);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {/* Brand */}
        <div style={{ marginBottom: "1.75rem", textAlign: "center" }}>
          <div className="brand" style={{ justifyContent: "center", display: "flex" }}>
            <SiteLogo suffix="Fantasy IPL" />
          </div>
          <p className="subtle" style={{ marginTop: "0.5rem", fontSize: "0.92rem" }}>
            Create your account and join the league
          </p>
        </div>

        {!hasBrowserSupabaseEnv && (
          <div role="alert" className="notice warning" style={{ marginBottom: "1rem" }}>
            Sign up is not ready yet. Finish the app setup first.
          </div>
        )}
        {authError && (
          <div role="alert" className="notice warning" style={{ marginBottom: "1rem" }}>
            {authError}
          </div>
        )}
        {authNotice && (
          <div role="status" className="notice success" style={{ marginBottom: "1rem" }}>
            {authNotice}
          </div>
        )}

        {hasBrowserSupabaseEnv && (
          <form action={signUpWithPasswordAction} className="form-grid">
            <input type="hidden" name="next" value={next} />

            <div className="field">
              <label htmlFor="signup-username">Display name</label>
              <input
                required
                autoComplete="username"
                className="input"
                id="signup-username"
                name="username"
                type="text"
                placeholder="How others will see you"
              />
            </div>

            <div className="field">
              <label htmlFor="signup-email">Email</label>
              <input
                required
                autoComplete="email"
                className="input"
                id="signup-email"
                name="email"
                type="email"
                placeholder="you@example.com"
              />
            </div>

            <div className="field">
              <label htmlFor="signup-password">Password</label>
              <input
                required
                minLength={6}
                autoComplete="new-password"
                className="input"
                id="signup-password"
                name="password"
                type="password"
                placeholder="At least 6 characters"
              />
            </div>

            <div className="field">
              <label htmlFor="signup-password-confirm">Confirm password</label>
              <input
                required
                minLength={6}
                autoComplete="new-password"
                className="input"
                id="signup-password-confirm"
                name="passwordConfirm"
                type="password"
                placeholder="Re-enter password"
              />
            </div>

            <button className="button" type="submit" style={{ marginTop: "0.25rem" }}>
              Create account
            </button>
          </form>
        )}

        <div className="auth-switch">
          Already have an account?{" "}
          <Link href={next !== "/lobby" ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
