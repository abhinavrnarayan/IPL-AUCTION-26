"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  eyebrow?: string;
  badge?: string;
  defaultOpen?: boolean;
  accentColor?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  eyebrow,
  badge,
  defaultOpen = false,
  accentColor = "rgba(99,102,241,0.2)",
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: `1px solid ${accentColor}`,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Drawer header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.9rem 1.2rem",
          background: open ? `color-mix(in srgb, ${accentColor} 60%, transparent)` : "rgba(255,255,255,0.01)",
          border: "none",
          borderBottom: open ? `1px solid ${accentColor}` : "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        {eyebrow && (
          <span className="eyebrow" style={{ fontSize: "0.72rem" }}>
            {eyebrow}
          </span>
        )}
        <span style={{ fontWeight: 600, fontSize: "1rem", flex: 1, color: "var(--foreground, #fff)" }}>
          {title}
        </span>
        {badge && (
          <span
            className="pill"
            style={{ fontSize: "0.72rem", background: "rgba(99,102,241,0.15)" }}
          >
            {badge}
          </span>
        )}
        {/* Chevron */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            opacity: 0.6,
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Collapsible body */}
      {open && (
        <div style={{ padding: "1.2rem" }}>
          {children}
        </div>
      )}
    </div>
  );
}
