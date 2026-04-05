"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import sflLogo from "@/app/images/sfl.png";

const PHASE_DELAYS: number[] = [450, 1500, 2650, 4050, 5350];

export default function IntroSplash() {
  const [phase, setPhase] = useState<number>(0);

  useEffect(() => {
    const timers = PHASE_DELAYS.map((delay, index) =>
      window.setTimeout(() => setPhase(index + 1), delay),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  if (phase >= 5) {
    return null;
  }

  return (
    <div className="sfl-intro" data-phase={phase} aria-hidden="true">
      <div className="sfl-intro-ambient sfl-intro-ambient-left" />
      <div className="sfl-intro-ambient sfl-intro-ambient-right" />
      <div className="sfl-intro-grid" />
      <div className="sfl-intro-grain" />
      <div className="sfl-intro-scanline" />
      <div className="sfl-intro-streak sfl-intro-streak-one" />
      <div className="sfl-intro-streak sfl-intro-streak-two" />

      <div className="sfl-intro-stage">
        <div className="sfl-intro-logo-wrap">
          <div className="sfl-intro-shockwave" />
          <div className="sfl-intro-orbit" />
          <div className="sfl-intro-logo-plate" />
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
          <div className="sfl-intro-edition">AUCTION PLATFORM - 2026</div>
        </div>
      </div>

      <div className="sfl-intro-rule" />
    </div>
  );
}
