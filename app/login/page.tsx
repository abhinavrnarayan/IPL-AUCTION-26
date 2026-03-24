import { redirect } from "next/navigation";
import { SiteLogo } from "@/components/site-logo";

import {
  getLoginAuthErrorMessage,
  getLoginAuthNoticeMessage,
  sanitizeNextPath,
} from "@/lib/auth-errors";
import {
  signInWithPasswordAction,
  signUpWithPasswordAction,
} from "@/app/login/actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { hasBrowserSupabaseEnv, hasServiceRoleEnv } from "@/lib/config";
import { getSessionUser } from "@/lib/server/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();

  if (user) {
    redirect("/lobby");
  }

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
    <main className="shell">
      <div className="nav">
        <div className="brand"><SiteLogo suffix="Auction Platform" /></div>
      </div>

      <section className="hero">
        <span className="eyebrow">Authentication</span>
        <h1>Sign in with Google or use a temporary email/password fallback.</h1>
        <p className="subtle">
          Use the credential path while the Google provider is offline, then head
          into the lobby to create rooms, join by code, upload rosters, and run
          the auction workflow.
        </p>
        {!hasBrowserSupabaseEnv ? (
          <div className="notice warning">
            Configure the Supabase browser values in{" "}
            <span className="mono">.env.local</span> before any auth method will
            work.
          </div>
        ) : null}
        {hasBrowserSupabaseEnv && !hasServiceRoleEnv ? (
          <div className="notice warning">
            Email/password login will work, but add{" "}
            <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> to{" "}
            <span className="mono">.env.local</span> before creating rooms,
            uploading rosters, bidding, and using the full server-side workflow.
          </div>
        ) : null}
        {authError ? <div className="notice warning">{authError}</div> : null}
        {authNotice ? <div className="notice success">{authNotice}</div> : null}
      </section>

      {hasBrowserSupabaseEnv ? (
        <section className="grid two" style={{ marginTop: "1rem" }}>
          <form action={signInWithPasswordAction} className="panel form-grid">
            <input type="hidden" name="next" value={next} />
            <div>
              <h2>Sign in with email</h2>
              <p className="subtle">
                Temporary fallback while Google auth is unavailable.
              </p>
            </div>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                required
                autoComplete="email"
                className="input"
                id="login-email"
                name="email"
                type="email"
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
              />
            </div>
            <button className="button secondary" type="submit">
              Sign in with password
            </button>
          </form>

          <form action={signUpWithPasswordAction} className="panel form-grid">
            <input type="hidden" name="next" value={next} />
            <div>
              <h2>Create a fallback account</h2>
              <p className="subtle">
                This creates a Supabase email/password user and stores your display
                name as the in-app username.
              </p>
            </div>
            <div className="field">
              <label htmlFor="signup-username">Username</label>
              <input
                required
                autoComplete="nickname"
                className="input"
                id="signup-username"
                name="username"
                type="text"
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
              />
            </div>
            <button className="button" type="submit">
              Create account
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Continue with Google</h2>
        <p className="subtle">
          Keep this path for later once the Google provider is enabled again in
          Supabase Auth.
        </p>
        <div className="button-row">
          <GoogleSignInButton next={next} />
        </div>
      </section>
    </main>
  );
}
