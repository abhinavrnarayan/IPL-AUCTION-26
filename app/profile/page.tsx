import type { Metadata } from "next";
import Link from "next/link";
import { requireSessionUser } from "@/lib/server/auth";
import { updateDisplayNameAction } from "@/app/profile/actions";
import { SiteLogo } from "@/components/site-logo";

export const metadata: Metadata = {
  title: "Profile",
  description: "View and update your SFL account details.",
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  name_too_short: "Display name must be at least 2 characters.",
  name_too_long: "Display name cannot exceed 40 characters.",
};
const NOTICES: Record<string, string> = {
  name_updated: "Display name updated successfully.",
};

/* Deterministic avatar background from user id */
const COLORS = [
  "#6366f1","#10b981","#f472b6","#f59e0b","#3b82f6","#8b5cf6",
];
function avatarBg(id: string) {
  return COLORS[id.charCodeAt(0) % COLORS.length];
}

function getInitials(displayName: string | null, email: string | null) {
  const src = displayName || email?.split("@")[0] || "?";
  return src
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSessionUser();
  const params = (await searchParams) ?? {};

  const errorKey = typeof params.error === "string" ? params.error : null;
  const noticeKey = typeof params.notice === "string" ? params.notice : null;

  const initials = getInitials(user.displayName, user.email);
  const bg = avatarBg(user.id);
  const displayName = user.displayName || user.email?.split("@")[0] || "";

  return (
    <main className="shell">
      {/* Nav */}
      <div className="nav">
        <div>
          <div className="brand"><SiteLogo suffix="Profile" /></div>
          <div className="subtle">{user.displayName ?? user.email ?? ""}</div>
        </div>
        <div className="button-row">
          <Link className="button ghost" href="/lobby">Lobby</Link>
        </div>
      </div>

      <div className="profile-page-grid">
        {/* ── Avatar card ── */}
        <section className="panel profile-avatar-card">
          <div
            className="profile-avatar-xl"
            style={{ background: bg }}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={displayName}
                className="profile-avatar-img"
              />
            ) : (
              <span className="profile-avatar-initials">{initials}</span>
            )}
          </div>

          <div className="profile-identity">
            <div className="profile-display-name">
              {user.displayName ?? <span className="subtle">No display name set</span>}
            </div>
            <div className="subtle" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              {user.email}
            </div>
          </div>

          <div className="profile-uid subtle" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
            ID: {user.id.slice(0, 12)}…
          </div>
        </section>

        {/* ── Edit panel ── */}
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Edit profile</h2>

          {errorKey && ERRORS[errorKey] && (
            <div role="alert" className="notice warning" style={{ marginBottom: "1rem" }}>
              {ERRORS[errorKey]}
            </div>
          )}
          {noticeKey && NOTICES[noticeKey] && (
            <div role="status" className="notice success" style={{ marginBottom: "1rem" }}>
              {NOTICES[noticeKey]}
            </div>
          )}

          <form action={updateDisplayNameAction} className="form-grid">
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input
                required
                className="input"
                id="displayName"
                name="displayName"
                type="text"
                defaultValue={displayName}
                minLength={2}
                maxLength={40}
                placeholder="How others will see you"
                autoComplete="nickname"
              />
              <span className="subtle" style={{ fontSize: "0.78rem" }}>
                2–40 characters. Shown in rooms and during auctions.
              </span>
            </div>

            <button className="button" type="submit">
              Save changes
            </button>
          </form>
        </section>

        {/* ── Account info ── */}
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Account details</h2>
          <dl className="profile-details-list">
            <dt>Email</dt>
            <dd>{user.email ?? "—"}</dd>
            <dt>Account ID</dt>
            <dd className="mono" style={{ fontSize: "0.8rem" }} title="Short reference only; full ID is hidden">
              {user.id.slice(0, 8)}…{user.id.slice(-4)}
            </dd>
          </dl>
        </section>
      </div>
    </main>
  );
}
