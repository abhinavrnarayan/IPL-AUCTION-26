import { scorePlayer } from "@/lib/domain/scoring";
import type { ResultsSnapshot } from "@/lib/domain/types";
import { formatCurrency, formatCurrencyShort } from "@/lib/utils";

export function ResultsBoard({ snapshot }: { snapshot: ResultsSnapshot }) {
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
      <section className="panel">
        <span className="eyebrow">Results centre</span>
        <h1 className="page-title" style={{ fontSize: "3rem", marginTop: "0.5rem" }}>
          {snapshot.room.name}
        </h1>
        <p className="subtle results-hero-copy">
          Follow the overall standings, top fantasy scorers, and each squad in a team-style leaderboard view.
        </p>
        <div className="stats-strip" style={{ marginTop: "1rem" }}>
          <div className="stat-tile">
            <strong>{snapshot.leaderboard.length}</strong>
            Teams ranked
          </div>
          <div className="stat-tile">
            <strong>{snapshot.squads.length}</strong>
            Players sold
          </div>
          <div className="stat-tile">
            <strong>{snapshot.trades.length}</strong>
            Trades executed
          </div>
          <div className="stat-tile">
            <strong>{totalPoints}</strong>
            Total points
          </div>
        </div>
      </section>

      <section className="grid two results-top-grid">
        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">General leaderboard</span>
              <h2 style={{ marginBottom: "0.15rem" }}>Overall rankings</h2>
            </div>
            {topTeam ? <span className="pill highlight">Leader: {topTeam.teamName}</span> : null}
          </div>
          <div className="leaderboard results-leaderboard">
            {rankedTeams.map((teamScore) => (
              <div className="leader-row results-leader-row" key={teamScore.teamId}>
                <div className={`results-rank-chip rank-${teamScore.rank <= 3 ? teamScore.rank : "rest"}`}>
                  #{teamScore.rank}
                </div>
                <div>
                  <strong>{teamScore.teamName}</strong>
                  <div className="subtle" style={{ fontSize: "0.8rem", marginTop: "0.18rem" }}>
                    {teamScore.shortCode} • {teamScore.squadCount} players
                  </div>
                </div>
                <div className="results-leader-stat">
                  <strong>{teamScore.totalPoints}</strong>
                  <span>Points</span>
                </div>
                <div className="results-leader-stat">
                  <strong>{formatCurrencyShort(teamScore.remainingPurse)}</strong>
                  <span>Purse left</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel results-panel-accent">
          <div className="results-panel-head">
            <div>
              <span className="eyebrow">Top scorers</span>
              <h2 style={{ marginBottom: "0.15rem" }}>Best players across teams</h2>
            </div>
          </div>
          <div className="results-top-scorers">
            {topScorers.map((player, index) => (
              <div className="results-scorer-card" key={`${player.id}-${index}`}>
                <div className="results-scorer-rank">#{index + 1}</div>
                <div>
                  <strong>{player.playerName}</strong>
                  <div className="subtle" style={{ fontSize: "0.8rem", marginTop: "0.2rem" }}>
                    {player.teamCode} • {player.role}
                  </div>
                </div>
                <div className="results-scorer-points">{player.points} pts</div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
            <article className="results-team-card" key={teamScore.teamId}>
              <div className="results-team-card-head">
                <div>
                  <div className="results-team-chip">{teamScore.shortCode}</div>
                  <h3 style={{ margin: "0.55rem 0 0.15rem" }}>{teamScore.teamName}</h3>
                  <div className="subtle" style={{ fontSize: "0.82rem" }}>
                    Rank #{teamScore.rank} • {teamScore.squadCount} players
                  </div>
                </div>
                <div className="results-team-total">
                  <strong>{teamScore.totalPoints}</strong>
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
            </article>
          ))}
        </div>
      </section>

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
                    {" ? "}
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

