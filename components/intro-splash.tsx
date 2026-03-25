"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import sflLogo from "@/app/images/sfl.png";

const PHASES: number[] = [
  0,
  400,
  1300,
  2100,
  3100,
  4300,
];

export default function IntroSplash() {
  const [phase, setPhase] = useState<number>(-1);

  useEffect(() => {
    setPhase(0);

    const timers = PHASES.slice(1).map((delay, index) =>
      window.setTimeout(() => setPhase(index + 1), delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  if (phase === -1 || phase >= 5) {
    return null;
  }

  return (
    <div className="sfl-intro" data-phase={phase} aria-hidden="true">
      <div className="sfl-intro-grain" />
      <div className="sfl-intro-scanline" />

      <div className="sfl-intro-logo-wrap">
        <div className="sfl-intro-shockwave" />
        <div className="sfl-intro-orbit" />
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
        <div className="sfl-intro-flare" />
      </div>

      <div className="sfl-intro-text">
        <div className="sfl-intro-wordmark">
          <span>S</span>
          <span>F</span>
          <span>L</span>
        </div>
        <div className="sfl-intro-tagline">St. Thomas Fantasy League</div>
        <div className="sfl-intro-edition">AUCTION PLATFORM · 2026</div>
      </div>

      <div className="sfl-intro-rule" />
    </div>
  );
}
