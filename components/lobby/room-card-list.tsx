"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { spring } from "@/lib/animations";
import { deriveRoleLabel, formatCurrency } from "@/lib/utils";

export type RoomSummary = {
  room: {
    id: string;
    name: string;
    code: string;
    purse: number;
    squadSize: number;
    timerSeconds: number;
  };
  isAdmin: boolean;
  isPlayer: boolean;
  memberCount: number;
  teamCount: number;
  auctionPhase: string | null;
};

export function RoomCardList({ rooms }: { rooms: RoomSummary[] }) {
  const reduced = useReducedMotion();

  if (rooms.length === 0) {
    return (
      <div className="empty-state">
        No rooms yet. Create one above or join a room with a code.
      </div>
    );
  }

  return (
    <div className="card-list">
      {rooms.map((summary, i) => (
        <motion.div
          key={summary.room.id}
          initial={reduced ? undefined : { opacity: 0, y: 10 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
          whileHover={reduced ? undefined : { y: -2, boxShadow: "0 16px 40px rgba(99,102,241,0.16)" }}
        >
          <Link className="room-card" href={`/room/${summary.room.code}`} style={{ display: "block" }}>
            <div className="header-row">
              <div>
                <strong>{summary.room.name}</strong>
                <div className="subtle mono">{summary.room.code}</div>
              </div>
              <div className="pill-row">
                <span className="pill">
                  {deriveRoleLabel({ isAdmin: summary.isAdmin, isPlayer: summary.isPlayer })}
                </span>
                {summary.auctionPhase === "COMPLETED" ? (
                  <span className="pill" style={{ color: "#fcd34d", borderColor: "rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.08)" }}>
                    Auction complete
                  </span>
                ) : null}
                <span className="pill highlight">{formatCurrency(summary.room.purse)}</span>
              </div>
            </div>
            <div className="stats-strip" style={{ marginTop: "0.9rem" }}>
              <div className="stat-tile"><strong>{summary.memberCount}</strong>Members</div>
              <div className="stat-tile"><strong>{summary.teamCount}</strong>Teams</div>
              <div className="stat-tile"><strong>{summary.room.squadSize}</strong>Squad size</div>
              <div className="stat-tile"><strong>{summary.room.timerSeconds}s</strong>Bid timer</div>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
