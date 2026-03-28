"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Drives --glow-x / --glow-y CSS variables on :root with a slow sine drift.
 * Full cycle ≈ 21 seconds — GPU-friendly, no layout/paint triggers.
 */
export function AmbientBackground() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;

    let frame: number;
    let t = 0;

    const animate = () => {
      t += 0.00025; // full cycle ≈ 25s
      const x = 5 + Math.sin(t) * 9;        // 5% ± 9%
      const y = 0 + Math.cos(t * 0.65) * 7; // 0% ± 7%
      document.documentElement.style.setProperty("--glow-x", `${x.toFixed(2)}%`);
      document.documentElement.style.setProperty("--glow-y", `${y.toFixed(2)}%`);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  return null;
}
