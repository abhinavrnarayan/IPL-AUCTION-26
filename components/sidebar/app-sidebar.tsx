"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

import { signOutAction } from "@/app/login/actions";
import type { UserProfile } from "@/lib/domain/types";

/* ─────────────────────────────────────────────
   Sport / league navigation tree
───────────────────────────────────────────── */
const NAV = [
  {
    sport: "Cricket",
    icon: "🏏",
    id: "cricket",
    leagues: [
      {
        label: "IPL 2026",
        href: "/lobby",
        soon: false,
        match: (p: string) =>
          p.startsWith("/lobby") || p.startsWith("/room") ||
          p.startsWith("/auction") || p.startsWith("/results"),
      },
      { label: "T20 Internationals", href: null, soon: true },
      { label: "ODI", href: null, soon: true },
    ],
  },
  {
    sport: "Football",
    icon: "⚽",
    id: "football",
    leagues: [
      { label: "ISL", href: null, soon: true },
      { label: "EPL", href: null, soon: true },
    ],
  },
];

const HIDDEN_PATHS = ["/", "/login", "/signup"];
const LS_KEY = "sfl-sidebar-collapsed";

/* ─── Avatar helpers ─── */
function getInitials(displayName: string | null, email: string | null): string {
  const src = displayName || email?.split("@")[0] || "?";
  return src
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "#6366f1", "#10b981", "#f472b6",
  "#f59e0b", "#3b82f6", "#8b5cf6",
];
function avatarColor(id: string) {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
interface AppSidebarProps {
  user: UserProfile | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sportsOpen, setSportsOpen] = useState<Record<string, boolean>>({
    cricket: true,
    football: false,
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const hidden = HIDDEN_PATHS.includes(pathname);

  /* ── Restore collapsed state from localStorage ── */
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LS_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);

  /* ── Auto-open the sport group whose league matches current path ── */
  useEffect(() => {
    const updates: Record<string, boolean> = {};
    for (const { id, leagues } of NAV) {
      if (leagues.some((l) => !l.soon && l.match?.(pathname))) {
        updates[id] = true;
      }
    }
    if (Object.keys(updates).length > 0) {
      setSportsOpen((prev) => ({ ...prev, ...updates }));
    }
  }, [pathname]);

  /* ── Sync body data-attribute so CSS can shift main content ── */
  useEffect(() => {
    if (hidden) {
      document.body.dataset.sidebar = "off";
    } else if (collapsed) {
      document.body.dataset.sidebar = "collapsed";
    } else {
      document.body.dataset.sidebar = "on";
    }
    return () => { document.body.dataset.sidebar = "off"; };
  }, [hidden, collapsed]);

  /* ── Close profile popover on outside click ── */
  useEffect(() => {
    if (!profileOpen) return;
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  /* ── Close mobile drawer on route change ── */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (hidden) return null;

  /* ── Handlers ── */
  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function toggleSport(id: string) {
    if (collapsed) {
      // Expand sidebar first on click if collapsed
      setCollapsed(false);
      try { localStorage.setItem(LS_KEY, "false"); } catch { /* ignore */ }
      setSportsOpen((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setSportsOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const initials = getInitials(user?.displayName ?? null, user?.email ?? null);
  const bgColor = avatarColor(user?.id ?? "a");
  const displayName = user?.displayName || user?.email?.split("@")[0] || "You";
  const email = user?.email ?? "";

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile hamburger — only shows on mobile, outside sidebar */}
      <button
        className={`sidebar-hamburger${mobileOpen ? " is-open" : ""}`}
        onClick={() => setMobileOpen((v) => !v)}
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      {/* ═════════════ Sidebar panel ═════════════ */}
      <aside
        className={[
          "app-sidebar",
          collapsed ? "sidebar-collapsed" : "",
          mobileOpen ? "sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* ── Brand + collapse toggle ── */}
        <div className="sidebar-brand">
          <Link href="/lobby" className="sidebar-logo-link" title="SFL Home">
            <Image
              alt="SFL"
              src="/images/sfl.png"
              width={28}
              height={28}
              style={{ objectFit: "contain", flexShrink: 0 }}
            />
            {!collapsed && <span className="sidebar-brand-text">SFL</span>}
          </Link>

          {/* Desktop collapse toggle */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className={`sidebar-collapse-icon${collapsed ? " flipped" : ""}`}>
              ‹
            </span>
          </button>
        </div>

        {/* ── Section label ── */}
        {!collapsed && (
          <div className="sidebar-section-label">Sports</div>
        )}

        {/* ── Navigation ── */}
        <nav className="sidebar-nav" aria-label="Sport navigation">
          {NAV.map(({ sport, icon, id, leagues }) => {
            const hasActive = leagues.some(
              (l) => !l.soon && l.match?.(pathname),
            );

            return (
              <div key={id} className="sidebar-sport-group">
                <button
                  type="button"
                  className={`sidebar-sport-header${hasActive ? " has-active" : ""}`}
                  onClick={() => toggleSport(id)}
                  aria-expanded={!collapsed && sportsOpen[id]}
                  title={collapsed ? sport : undefined}
                >
                  <span className="sidebar-sport-icon" aria-hidden="true">
                    {icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="sidebar-sport-name">{sport}</span>
                      <span
                        className={`sidebar-chevron${sportsOpen[id] ? " open" : ""}`}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    </>
                  )}
                </button>

                {/* League list — only show when expanded and sport open */}
                {!collapsed && sportsOpen[id] && (
                  <ul className="sidebar-league-list" role="list">
                    {leagues.map((league) => {
                      const isActive =
                        !league.soon && league.match?.(pathname);

                      if (league.soon) {
                        return (
                          <li
                            key={league.label}
                            className="sidebar-league-item soon"
                          >
                            <span className="sidebar-league-dot" />
                            <span className="sidebar-league-label">
                              {league.label}
                            </span>
                            <span className="sidebar-soon-badge">Soon</span>
                          </li>
                        );
                      }

                      return (
                        <li
                          key={league.label}
                          className="sidebar-league-item"
                        >
                          <Link
                            href={league.href!}
                            className={`sidebar-league-link${isActive ? " active" : ""}`}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span className="sidebar-league-dot" />
                            <span className="sidebar-league-label">
                              {league.label}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* ═════════════ Profile footer ═════════════ */}
        <div className="sidebar-footer" ref={profileRef}>
          {/* Profile button — expands a mini-popover */}
          <button
            type="button"
            className={`sidebar-profile-btn${profileOpen ? " active" : ""}`}
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            title={collapsed ? displayName : undefined}
          >
            {/* Avatar */}
            <span
              className="sidebar-avatar"
              style={{ background: bgColor }}
              aria-hidden="true"
            >
              {user?.avatarUrl ? (
                <Image
                  src={user.avatarUrl}
                  alt={displayName}
                  width={30}
                  height={30}
                  style={{ borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <span className="sidebar-avatar-initials">{initials}</span>
              )}
            </span>

            {!collapsed && (
              <span className="sidebar-profile-info">
                <span className="sidebar-profile-name">{displayName}</span>
                <span className="sidebar-profile-email">{email}</span>
              </span>
            )}

            {!collapsed && (
              <span className="sidebar-profile-chevron" aria-hidden="true">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transition: "transform 0.15s ease",
                    transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            )}
          </button>

          {/* Profile popover */}
          {profileOpen && (
            <div
              className={`sidebar-profile-popover${collapsed ? " popover-right" : ""}`}
            >
              {/* Popover header */}
              <div className="sidebar-popover-header">
                <span
                  className="sidebar-avatar sidebar-avatar-lg"
                  style={{ background: bgColor }}
                >
                  {user?.avatarUrl ? (
                    <Image
                      src={user.avatarUrl}
                      alt={displayName}
                      width={42}
                      height={42}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <span className="sidebar-avatar-initials">{initials}</span>
                  )}
                </span>
                <div className="sidebar-popover-header-info">
                  <div className="sidebar-popover-name">{displayName}</div>
                  <div className="sidebar-popover-email">{email}</div>
                </div>
              </div>

              <div className="sidebar-popover-divider" />

              <Link
                href="/profile"
                className="sidebar-popover-item"
                onClick={() => {
                  setProfileOpen(false);
                  setMobileOpen(false);
                }}
              >
                <span className="sidebar-popover-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </span>
                Profile &amp; settings
              </Link>

              <div className="sidebar-popover-divider" />

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="sidebar-popover-item sidebar-popover-signout"
                >
                  <span className="sidebar-popover-icon" aria-hidden="true">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </span>
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
