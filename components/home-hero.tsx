"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { SiteLogo } from "@/components/site-logo";
import { fadeUp, staggerContainer, spring } from "@/lib/animations";

const statTiles = [
  { title: "Live auction rooms", desc: "Create a room, invite your group, and run the auction together in real time." },
  { title: "Fantasy squad building", desc: "Buy players, manage your purse, and build the team you want for the season." },
  { title: "Results and room control", desc: "Track sold players, room progress, squads, and results in one place." },
];

export function HomeHero() {
  const reduced = useReducedMotion();

  return (
    <main className="shell">
      <motion.div
        className="nav"
        initial={reduced ? undefined : { opacity: 0, y: -10 }}
        animate={reduced ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="brand"><SiteLogo suffix="St. Thomas Fantasy League" /></div>
        <div className="button-row">
          <motion.div whileHover={reduced ? undefined : { scale: 1.03 }} whileTap={reduced ? undefined : { scale: 0.97 }} transition={spring.snappy}>
            <Link className="button ghost" href="/login">Sign in</Link>
          </motion.div>
          <motion.div whileHover={reduced ? undefined : { scale: 1.04, y: -1 }} whileTap={reduced ? undefined : { scale: 0.97 }} transition={spring.snappy}>
            <Link className="button" href="/lobby">Open lobby</Link>
          </motion.div>
        </div>
      </motion.div>

      <motion.section
        className="hero"
        variants={reduced ? undefined : staggerContainer(0.1, 0.08)}
        initial={reduced ? undefined : "hidden"}
        animate={reduced ? undefined : "visible"}
      >
        <motion.span className="eyebrow" variants={reduced ? undefined : fadeUp}>
          Fantasy IPL Auction Game
        </motion.span>
        <motion.h1 variants={reduced ? undefined : fadeUp}>
          Build your SFL fantasy IPL team through live auctions.
        </motion.h1>
        <motion.p className="subtle" variants={reduced ? undefined : fadeUp}>
          SFL, St. Thomas Fantasy League, is a fantasy game built for creating
          IPL teams through auctions, shaping squads with strategy, and then
          battling it out after the auction is done. It is actually GAMBLING.
        </motion.p>

        <motion.div
          className="stats-strip"
          variants={reduced ? undefined : staggerContainer(0.1, 0.3)}
        >
          {statTiles.map(({ title, desc }) => (
            <motion.div
              key={title}
              className="stat-tile"
              variants={reduced ? undefined : fadeUp}
            >
              <strong>{title}</strong>
              {desc}
            </motion.div>
          ))}
        </motion.div>
      </motion.section>
    </main>
  );
}
