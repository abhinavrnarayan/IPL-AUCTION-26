"use client";

import { useEffect, useState } from "react";

/**
 * Shows a subtle "taking longer than expected" notice after `delayMs` of being mounted.
 * Embed inside loading.tsx so users know the page is loading, not broken.
 */
export function StuckAlert({ delayMs = 7000 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);

  if (!visible) return null;

  return (
    <div
      style={{
        marginTop: "1.5rem",
        padding: "0.65rem 1rem",
        borderRadius: "8px",
        border: "1px solid rgba(251,191,36,0.25)",
        background: "rgba(251,191,36,0.06)",
        fontSize: "0.82rem",
        color: "rgba(251,191,36,0.85)",
        textAlign: "center",
        animation: "fadeIn 0.4s ease",
      }}
    >
      Still loading… this is taking longer than usual. Check your connection or try refreshing.
    </div>
  );
}
