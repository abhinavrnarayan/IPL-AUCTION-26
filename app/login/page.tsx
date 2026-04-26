import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteLogo } from "@/components/site-logo";

import {
  getLoginAuthErrorMessage,
  getLoginAuthNoticeMessage,
  sanitizeNextPath,
} from "@/lib/auth-errors";
import { signInWithPasswordAction } from "@/app/login/actions";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { getSessionUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Sign In | SFL Fantasy IPL",
  description: "Sign in to your SFL account to join a fantasy IPL auction room.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default async function LoginPage({
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
            Sign in to your account to continue
          </p>
        </div>

        {!hasBrowserSupabaseEnv && (
          <div role="alert" className="notice warning" style={{ marginBottom: "1rem" }}>
            Sign in is not ready yet. Finish the app setup first.
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
          <form action={signInWithPasswordAction} className="form-grid">
            <input type="hidden" name="next" value={next} />

            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                required
                autoComplete="email"
                className="input"
                id="login-email"
                name="email"
                type="email"
                placeholder="you@example.com"
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                required
                autoComplete="current-password"
                className="input"
                id="login-password"
                name="password"
                type="password"
                placeholder="Your password"
              />
            </div>

            <button className="button" type="submit" style={{ marginTop: "0.25rem" }}>
              Sign in
            </button>
          </form>
        )}

        {hasBrowserSupabaseEnv && (
          <div className="forgot-password-row" style={{ marginTop: "0.75rem", textAlign: "right" }}>
            <Link href="/login/reset" className="auth-link">
              Forgot your password?
            </Link>
          </div>
        )}

        <div className="auth-switch" style={{ marginTop: "0.5rem" }}>
          Don&apos;t have an account?{" "}
          <Link href={next !== "/lobby" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>
            Create one
          </Link>
        </div>
      </div>
    </div>
  );
}
