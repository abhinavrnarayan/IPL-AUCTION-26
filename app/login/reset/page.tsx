import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteLogo } from "@/components/site-logo";

import {
  getLoginAuthErrorMessage,
  getLoginAuthNoticeMessage,
} from "@/lib/auth-errors";
import { resetPasswordAction } from "@/app/login/actions";
import { hasBrowserSupabaseEnv } from "@/lib/config";
import { getSessionUser } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Reset Password | SFL Fantasy IPL",
  description: "Send a password reset link to your SFL account email.",
  alternates: { canonical: "/login/reset" },
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/lobby");

  const resolved = (await searchParams) ?? {};
  const authErrorParam = resolved.authError;
  const authNoticeParam = resolved.authNotice;

  const authError =
    typeof authErrorParam === "string" ? getLoginAuthErrorMessage(authErrorParam) : null;
  const authNotice =
    typeof authNoticeParam === "string" ? getLoginAuthNoticeMessage(authNoticeParam) : null;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div style={{ marginBottom: "1.75rem", textAlign: "center" }}>
          <div className="brand" style={{ justifyContent: "center", display: "flex" }}>
            <SiteLogo suffix="Fantasy IPL" />
          </div>
          <p className="subtle" style={{ marginTop: "0.5rem", fontSize: "0.92rem" }}>
            Enter your email to receive a reset link
          </p>
        </div>

        {!hasBrowserSupabaseEnv && (
          <div role="alert" className="notice warning" style={{ marginBottom: "1rem" }}>
            Password reset is not ready yet. Finish the app setup first.
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
          <form action={resetPasswordAction} className="form-grid">
            <div className="field">
              <label htmlFor="reset-email">Email address</label>
              <input
                required
                autoComplete="email"
                className="input"
                id="reset-email"
                name="email"
                type="email"
                placeholder="you@example.com"
              />
            </div>
            <button className="button" type="submit" style={{ marginTop: "0.25rem" }}>
              Send reset link
            </button>
          </form>
        )}

        <div className="auth-switch" style={{ marginTop: "1rem" }}>
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
