"use client";

import { motion, useReducedMotion, AnimatePresence } from "framer-motion";

import { scorePlayer } from "@/lib/domain/scoring";
import type { ResultsSnapshot } from "@/lib/domain/types";
import { fadeUp, staggerContainer, spring, slideRight } from "@/lib/animations";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { formatCurrency, formatCurrencyShort } from "@/lib/utils";

export function ResultsBoard({ snapshot }: { snapshot: ResultsSnapshot }) {
  const reduced = useReducedMotion();

  const squadsByTeamId = new Map(
    snapshot.teams.map((team) => [
      team.id,
      snapshot.squads.filter((entry) => entry.teamId === team.id),
    ]),
  );
  const teamById = new Map(snapshot.teams.map((team) => [team.id, team]));
  const topTeam = snapshot.leaderboard[0] ?? null;
  const totalPoints = snapshot.leaderboard.reduce(
    (sum, teamScore) => sum + teamScore.totalPoints,
    0,
  );

  const rankedTeams = snapshot.leaderboard.map((teamScore, index) => {
    const team = teamById.get(teamScore.teamId);
    const squadEntries = (squadsByTeamId.get(teamScore.teamId) ?? [])
      .map((entry) => ({
        ...entry,
        points: entry.player ? scorePlayer(entry.player) : 0,
      }))
      .sort((left, right) => right.points - left.points || right.purchasePrice - left.purchasePrice);

    return {
      ...teamScore,
      shortCode: team?.shortCode ?? teamScore.teamName.slice(0, 3).toUpperCase(),
      squadEntries,
      rank: index + 1,
    };
  });

  const topScorers = rankedTeams
    .flatMap((team) =>
      team.squadEntries.map((entry) => ({
        id: entry.id,
        playerName: entry.player?.name ?? "Unknown player",
        role: entry.player?.role ?? "Player",
        teamName: team.teamName,
        teamCode: team.shortCode,
        points: entry.points,
      })),
    )
    .sort((left, right) => right.points - left.points || left.playerName.localeCompare(right.playerName))
    .slice(0, 8);

  return (
    <div className="grid" style={{ marginTop: "1rem" }}>
      {/* Hero stats */}
      <motion.section
        className="panel"
        variants={reduced ? undefined : staggerContainer(0.1)}
        initial={reduced ? undefined : "hidden"}
        animate={reduced ? undefined : "visible"}
      >
        <motion.span className="eyebrow" variants={reduced ? undefined : fadeUp}>
          Results centre
        </motion.span>
        <motion.h1
          className="page-title"
          style={{ fontSize: "3rem", marginTop: "0.5rem" }}
          variants={reduced ? undefined : fadeUp}
        >
          {snapshot.room.name}
        </motion.h1>
        <motion.p className="subtle results-hero-copy" variants={reduced ? undefined : fadeUp}>
          Follow the overall standings, top fantasy scorers, and each squad in a team-style leaderboard view.
        </motion.p>
        <motion.div
          className="stats-strip"
          style={{ marginTop: "1rem" }}
          variants={reduced ? undefined : staggerContainer(0.08, 0.3)}
        >
          {[
            { value: snapshot.leaderboard.length, label: "Teams ranked" },
            { value: snapshot.squads.length, label: "Players sold" },
            { value: snapshot.trades.length, label: "Trades executed" },
            { value: totalPoints, label: "Total points" },
          ].map(({ value, label }) => (
            <motion.div key={label} className="stat-tile" variants={reduced ? undefined : fadeUp}>
              <strong><AnimatedNumber value={value} /></strong>
              {label}
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Leaderboard + Top scorers */}
      <section className="grid two results-top-grid">
        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">General leaderboard</span>
              <h2 style={{ marginBottom: "0.15rem" }}>Overall rankings</h2>
            </div>
            {topTeam ? <span className="pill highlight">Leader: {topTeam.teamName}</span> : null}
          </div>
          <motion.div
            className="leaderboard results-leaderboard"
            variants={reduced ? undefined : staggerContainer(0.06)}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            {rankedTeams.map((teamScore) => (
              <motion.div
                className="leader-row results-leader-row"
                key={teamScore.teamId}
                variants={reduced ? undefined : slideRight}
                transition={spring.smooth}
                whileHover={reduced ? undefined : { x: 4, backgroundColor: "rgba(99,102,241,0.06)" }}
              >
                <motion.div
                  className={`results-rank-chip rank-${teamScore.rank <= 3 ? teamScore.rank : "rest"}`}
                  initial={reduced ? undefined : { scale: 0.7, opacity: 0 }}
                  animate={reduced ? undefined : { scale: 1, opacity: 1 }}
                  transition={{ ...spring.bouncy, delay: teamScore.rank * 0.05 }}
                >
                  {teamScore.rank === 1 ? "🏆" : `#${teamScore.rank}`}
                </motion.div>
                <div>
                  <strong>{teamScore.teamName}</strong>
                  <div className="subtle" style={{ fontSize: "0.8rem", marginTop: "0.18rem" }}>
                    {teamScore.shortCode} • {teamScore.squadCount} players
                  </div>
                </div>
                <div className="results-leader-stat">
                  <strong><AnimatedNumber value={teamScore.totalPoints} /></strong>
                  <span>Points</span>
                </div>
                <div className="results-leader-stat">
                  <strong>{formatCurrencyShort(teamScore.remainingPurse)}</strong>
                  <span>Purse left</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">Top scorers</span>
              <h2 style={{ marginBottom: "0.15rem" }}>Best players across teams</h2>
            </div>
          </div>
          <motion.div
            className="results-top-scorers"
            variants={reduced ? undefined : staggerContainer(0.05)}
            initial={reduced ? undefined : "hidden"}
            animate={reduced ? undefined : "visible"}
          >
            {topScorers.map((player, index) => (
              <motion.div
                className="results-scorer-card"
                key={`${player.id}-${index}`}
                variants={reduced ? undefined : fadeUp}
                whileHover={reduced ? undefined : { x: 3 }}
                transition={spring.snappy}
              >
                <div className="results-scorer-rank">#{index + 1}</div>
                <div>
                  <strong>{player.playerName}</strong>
                  <div className="subtle" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                    {player.teamCode} • {player.role}
                  </div>
                </div>
                <div className="results-scorer-points">
                  <AnimatedNumber value={player.points} /> pts
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team boards */}
      <section className="panel results-panel-accent">
        <div className="results-panel-head">
          <div>
            <span className="eyebrow">Dream team boards</span>
            <h2 style={{ marginBottom: "0.15rem" }}>Team-wise leaderboards</h2>
          </div>
          {topTeam ? (
            <span className="pill">
              Winning squad: {topTeam.teamName} • {topTeam.totalPoints} pts
            </span>
          ) : null}
        </div>
        <div className="results-team-board-grid">
          {rankedTeams.map((teamScore) => (
            <motion.article
              className="results-team-card"
              key={teamScore.teamId}
              initial={reduced ? undefined : { opacity: 0, y: 12 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              whileHover={reduced ? undefined : { y: -3, boxShadow: "0 16px 40px rgba(99,102,241,0.14)" }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="results-team-card-head">
                <div>
                  <div className="results-team-chip">{teamScore.shortCode}</div>
                  <h3 style={{ margin: "0.55rem 0 0.15rem" }}>{teamScore.teamName}</h3>
                  <div className="subtle" style={{ fontSize: "0.82rem" }}>
                    Rank #{teamScore.rank} • {teamScore.squadCount} players
                  </div>
                </div>
                <div className="results-team-total">
                  <strong><AnimatedNumber value={teamScore.totalPoints} /></strong>
                  <span>Total points</span>
                </div>
              </div>
              <div className="results-team-card-stats">
                <span className="pill highlight">{formatCurrencyShort(teamScore.remainingPurse)}</span>
                <span className="pill">{teamScore.squadEntries.length} bought</span>
                <span className="pill">Best: {teamScore.squadEntries[0]?.player?.name ?? "No players"}</span>
              </div>
              <div className="results-player-board">
                {teamScore.squadEntries.length === 0 ? (
                  <div className="empty-state">No players in this team yet.</div>
                ) : (
                  teamScore.squadEntries.map((entry, playerIndex) => (
                    <div className="results-player-row" key={entry.id}>
                      <div className="results-player-rank">{playerIndex + 1}</div>
                      <div>
                        <strong>{entry.player?.name ?? "Unknown player"}</strong>
                        <div className="subtle" style={{ fontSize: "0.78rem", marginTop: "0.15rem" }}>
                          {entry.player?.role ?? "Player"} • Bought for {formatCurrencyShort(entry.purchasePrice)}
                        </div>
                      </div>
                      <div className="results-player-points">{entry.points} pts</div>
                    </div>
                  ))
                )}
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Squad archive + trade log */}
      <section className="grid two">
        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">Squad archive</span>
              <h2 style={{ marginBottom: "0.15rem" }}>All squads</h2>
            </div>
          </div>
          <div className="card-list">
            {snapshot.teams.map((team) => (
              <div className="trade-card results-squad-card" key={team.id}>
                <div className="header-row">
                  <strong>{team.name}</strong>
                  <span className="pill highlight">{formatCurrencyShort(team.purseRemaining)}</span>
                </div>
                <div className="card-list" style={{ marginTop: "0.75rem" }}>
                  {(squadsByTeamId.get(team.id) ?? []).map((entry) => (
                    <div className="bid-row results-squad-row" key={entry.id}>
                      <strong>{entry.player?.name ?? "Unknown player"}</strong>
                      <span className="subtle">{entry.player?.role ?? "Player"}</span>
                      <span>{formatCurrency(entry.purchasePrice)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">Trade log</span>
              <h2 style={{ marginBottom: "0.15rem" }}>Trade history</h2>
            </div>
          </div>
          {snapshot.trades.length === 0 ? (
            <div className="empty-state">No trades have been executed yet.</div>
          ) : (
            <div className="card-list">
              {snapshot.trades.map((trade) => (
                <div className="trade-card" key={trade.id}>
                  <strong>
                    {snapshot.teams.find((team) => team.id === trade.teamAId)?.name ?? "Team A"}
                    {" ⇄ "}
                    {snapshot.teams.find((team) => team.id === trade.teamBId)?.name ?? "Team B"}
                  </strong>
                  <div className="subtle">
                    Cash: {formatCurrency(trade.cashFromA)} / {formatCurrency(trade.cashFromB)}
                  </div>
                  <div className="pill-row" style={{ marginTop: "0.65rem" }}>
                    <span className="pill">A players: {trade.playersFromA.length}</span>
                    <span className="pill">B players: {trade.playersFromB.length}</span>
                    <span className="pill highlight">{trade.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
