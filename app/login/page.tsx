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
        <div className="brand"><SiteLogo suffix="Login" /></div>
      </div>

      <section className="hero">
        <span className="eyebrow">Welcome</span>
        <h1>Sign in or create your SFL account.</h1>
        <p className="subtle">
          Join St. Thomas Fantasy League, enter your room, build your IPL squad,
          and take part in the auction.
        </p>
        {!hasBrowserSupabaseEnv ? (
          <div className="notice warning">
            Sign in is not ready yet. Please finish the app setup first.
          </div>
        ) : null}
        {hasBrowserSupabaseEnv && !hasServiceRoleEnv ? (
          <div className="notice warning">
            Sign in is ready, but some room features are still being set up.
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
              <h2>Sign in</h2>
              <p className="subtle">
                Use your email and password to enter SFL.
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
              Sign in
            </button>
          </form>

          <form action={signUpWithPasswordAction} className="panel form-grid">
            <input type="hidden" name="next" value={next} />
            <div>
              <h2>Create an account</h2>
              <p className="subtle">
                Create your account and choose the name you want to use inside SFL.
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
    </main>
  );
}
