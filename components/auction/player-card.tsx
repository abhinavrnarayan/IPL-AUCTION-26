"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import type { Player, Team } from "@/lib/domain/types";
import { scalePop, spring } from "@/lib/animations";
import { formatCurrencyShort } from "@/lib/utils";

export function PlayerCard({
  player,
  currentTeam,
  currentBid,
}: {
  player: Player | null;
  currentTeam: Team | null;
  currentBid: number | null;
}) {
  const reduced = useReducedMotion();

  if (!player) {
    return (
      <div className="player-card">
        <strong>No active player</strong>
        <div className="subtle">
          Start the auction or advance to the next player from the room controls.
        </div>
      </div>
    );
  }

  const franchise =
    (player.stats?.["franchise"] as string | undefined) ??
    (player.stats?.["team"] as string | undefined) ??
    (player.stats?.["ipl_team"] as string | undefined) ??
    null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={player.id}
        className="player-card"
        variants={reduced ? undefined : scalePop}
        initial={reduced ? undefined : "hidden"}
        animate={reduced ? undefined : "visible"}
        exit={reduced ? undefined : "exit"}
        transition={spring.smooth}
      >
        <div className="header-row">
          <div>
            <span className="eyebrow">On the block</span>
            <motion.h2
              style={{ marginTop: "0.6rem" }}
              initial={reduced ? undefined : { opacity: 0, x: -8 }}
              animate={reduced ? undefined : { opacity: 1, x: 0 }}
              transition={{ ...spring.snappy, delay: 0.08 }}
            >
              {player.name}
            </motion.h2>
            {franchise ? (
              <div className="subtle" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                {franchise}
              </div>
            ) : null}
          </div>
          <div className="pill-row">
            <span className="pill">{player.role}</span>
            {player.nationality ? <span className="pill">{player.nationality}</span> : null}
            <span className="pill highlight">Base {formatCurrencyShort(player.basePrice)}</span>
          </div>
        </div>

        <div className="stats-strip">
          <div className="stat-tile">
            <AnimatePresence mode="wait">
              <motion.strong
                key={currentBid ?? player.basePrice}
                initial={reduced ? undefined : { opacity: 0, y: -8, scale: 0.9 }}
                animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, y: 8 }}
                transition={spring.bouncy}
              >
                {formatCurrencyShort(currentBid ?? player.basePrice)}
              </motion.strong>
            </AnimatePresence>
            Current bid
          </div>
          <div className="stat-tile">
            <AnimatePresence mode="wait">
              <motion.strong
                key={currentTeam?.id ?? "open"}
                initial={reduced ? undefined : { opacity: 0, scale: 0.85 }}
                animate={reduced ? undefined : { opacity: 1, scale: 1 }}
                transition={spring.snappy}
              >
                {currentTeam?.shortCode ?? "Open"}
              </motion.strong>
            </AnimatePresence>
            {currentTeam?.name ?? "No bid yet"}
          </div>
          <div className="stat-tile">
            <strong>{player.status}</strong>
            Status
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
