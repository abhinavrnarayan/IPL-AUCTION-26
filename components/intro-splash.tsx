"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import sflLogo from "@/app/images/sfl.png";

// localStorage key — persists forever so intro only plays on first-ever visit
const STORAGE_KEY = "sfl_intro_played";

// Phase durations (ms)
const PHASES: number[] = [
  0,    // phase 0 — black screen, immediate
  400,  // phase 1 — logo punch-in
  1300, // phase 2 — wordmark stamp
  2100, // phase 3 — tagline + lens flare
  3100, // phase 4 — fade out
  4300, // done — unmount
];

export default function IntroSplash() {
  const [phase, setPhase] = useState<number>(-1); // -1 = not started / already played
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    // Skip if already played on this device (localStorage persists forever)
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, "1");
    setPhase(0);

    const timers = PHASES.slice(1).map((delay, i) =>
      setTimeout(() => setPhase(i + 1), delay)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  // Not started or already finished
  if (phase === -1 || phase >= 5) return null;

  return (
    <div className="sfl-intro" data-phase={phase} aria-hidden="true">
      {/* Noise / grain overlay */}
      <div className="sfl-intro-grain" />

      {/* Horizontal scan line sweep */}
      <div className="sfl-intro-scanline" />

      {/* Logo centrepiece */}
      <div className="sfl-intro-logo-wrap">
        {/* Shockwave ring */}
        <div className="sfl-intro-shockwave" />
        {/* Outer rotating ring */}
        <div className="sfl-intro-orbit" />
        {/* Logo disc */}
        <div className="sfl-intro-disc">
          <Image
            src={sflLogo}
            alt="SFL"
            width={140}
            height={140}
            priority
            className="sfl-intro-img"
          />
        </div>
        {/* Lens flare */}
        <div className="sfl-intro-flare" />
      </div>

      {/* Text block */}
      <div className="sfl-intro-text">
        <div className="sfl-intro-wordmark">
          <span>S</span>
          <span>F</span>
          <span>L</span>
        </div>
        <div className="sfl-intro-tagline">St. Thomas Fantasy League</div>
        <div className="sfl-intro-edition">AUCTION PLATFORM · 2026</div>
      </div>

      {/* Bottom rule */}
      <div className="sfl-intro-rule" />
    </div>
  );
}
