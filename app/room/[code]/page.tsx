import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { ImportResultsForm } from "@/components/room/import-results-form";
import { PlayerPoolManager } from "@/components/room/player-pool-manager";
import { ReadinessPanel } from "@/components/room/readiness-panel";
import { RoomInvitePanel } from "@/components/room/room-invite-panel";
import { StartAuctionButton } from "@/components/room/start-auction-button";
import { TeamOwnershipPanel } from "@/components/room/team-ownership-panel";
import { UploadPlayersForm } from "@/components/room/upload-players-form";
import { UploadTeamsForm } from "@/components/room/upload-teams-form";
import { SelfCreateTeamForm } from "@/components/room/self-create-team-form";
import { TradePanel } from "@/components/trades/trade-panel";
import { DashboardAutoRefresher } from "@/components/dashboard-auto-refresher";
import { SquadBoard } from "@/components/auction/squad-board";
import { defaultPlayerPoolCount } from "@/lib/default-player-pool";
import { hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getRoomSnapshot } from "@/lib/server/queries";
import { deriveRoleLabel, formatCurrency, formatCurrencyShort } from "@/lib/utils";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await requireSessionUser();

  if (!hasServiceRoleEnv) {
    return (
      <main className="shell">
        <div className="panel">
          <h1 className="page-title">Configuration required</h1>
          <p className="subtle">
            Add the Supabase service role key before opening room management pages.
          </p>
          <Link className="button" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  const snapshot = await getRoomSnapshot(code, user);

  if (!snapshot.currentMember) {
    return (
      <main className="shell">
        <div className="panel">
          <h1 className="page-title">Room access required</h1>
          <p className="subtle">
            Join this room from the lobby first so the platform can attach your
            role and permissions.
          </p>
          <Link className="button" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  const summaryButtonStyle = {
    outline: "none",
    listStyle: "none",
    display: "block",
    cursor: "pointer",
  } as const;

  return (
    <main className="shell">
      <DashboardAutoRefresher roomId={snapshot.room.id} />
      <div className="nav">
        <div>
          <div className="brand"><SiteLogo suffix="Room" /></div>
          <div className="subtle" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{snapshot.room.name}</div>
          <div className="subtle mono">{snapshot.room.code}</div>
        </div>
        <div className="link-row">
          <Link className="button ghost" href="/lobby">
            Lobby
          </Link>
          <Link className="button secondary" href={`/results/${snapshot.room.code}`}>
            Results
          </Link>
          {snapshot.auctionState?.phase !== "WAITING" ? (
            <Link className="button" href={`/auction/${snapshot.room.code}`}>
              Open auction
            </Link>
          ) : null}
        </div>
      </div>

      <section className="panel">
        <div className="header-row">
          <div>
            <span className="eyebrow">Room control</span>
            <h1 className="page-title" style={{ fontSize: "3.2rem", marginTop: "0.4rem" }}>
              Setup and launch
            </h1>
          </div>
          <div className="pill-row">
            <span className="pill">{deriveRoleLabel(snapshot.currentMember)}</span>
            <span className="pill highlight">
              {snapshot.auctionState?.phase ?? "WAITING"}
            </span>
          </div>
        </div>

        <div className="stats-strip" style={{ marginTop: "1rem" }}>
          <div className="stat-tile">
            <strong>{formatCurrency(snapshot.room.purse)}</strong>
            Starting purse
          </div>
          <div className="stat-tile">
            <strong>{snapshot.room.squadSize}</strong>
            Squad size
          </div>
          <div className="stat-tile">
            <strong>{snapshot.room.timerSeconds}s</strong>
            Bid timer
          </div>
          <div className="stat-tile">
            <strong>{formatCurrency(snapshot.room.bidIncrement)}</strong>
            Increment
          </div>
        </div>
      </section>

      {snapshot.currentMember.isAdmin ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <RoomInvitePanel
            roomCode={snapshot.room.code}
            roomName={snapshot.room.name}
          />
        </section>
      ) : null}

      <section className="split" style={{ marginTop: "1rem" }}>
        <div className="grid">
          {snapshot.currentMember.isAdmin ? (
            <>
              <div className="panel">
                <h2>Roster upload</h2>
                <p className="subtle">
                  Load the built-in master player pool or upload a refreshed CSV/XLSX
                  sheet for this room.
                </p>
                <UploadPlayersForm
                  defaultPlayerCount={defaultPlayerPoolCount}
                  roomCode={snapshot.room.code}
                />
              </div>

              <div className="panel">
                <h2>Team upload</h2>
                <UploadTeamsForm roomCode={snapshot.room.code} />
              </div>

              {/* Admin My Team — same panel as member view */}
              <div className="panel" style={{ borderColor: "rgba(251,191,36,0.18)", background: "linear-gradient(145deg, rgba(251,191,36,0.05), rgba(10,8,30,0.5))" }}>
                <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>My Team</span>
                  <span className="eyebrow" style={{ fontSize: "0.65rem" }}>Admin</span>
                </h2>
                {(() => {
                  const myTeam = snapshot.teams.find((t) => t.ownerUserId === user.id);
                  if (myTeam) {
                    return (
                      <details className="room-card" style={{ marginTop: "0.5rem", cursor: "pointer", borderColor: "rgba(251,191,36,0.15)" }}>
                        <summary style={summaryButtonStyle}>
                          <strong>{myTeam.name}</strong>
                          <div className="subtle mono">{myTeam.shortCode}</div>
                          <div className="pill-row" style={{ marginTop: "0.5rem" }}>
                            <span className="pill highlight">{formatCurrencyShort(myTeam.purseRemaining)}</span>
                            <span className="pill">Squad limit: {myTeam.squadLimit}</span>
                          </div>
                        </summary>
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "grid", gap: "0.5rem" }}>
                          {snapshot.squads.filter(s => s.teamId === myTeam.id).length === 0 ? (
                            <div className="subtle" style={{ fontSize: "0.9rem" }}>No players bought yet.</div>
                          ) : (
                            snapshot.squads.filter(s => s.teamId === myTeam.id).map(s => {
                              const p = snapshot.players.find(x => x.id === s.playerId);
                              return (
                                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                                  <span>{p?.name} <span className="subtle" style={{ fontSize: "0.8rem" }}>{p?.role}</span></span>
                                  <strong style={{ color: "var(--primary-strong)" }}>{formatCurrencyShort(s.purchasePrice)}</strong>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </details>
                    );
                  }
                  return (
                    <div className="subtle" style={{ fontSize: "0.9rem" }}>
                      You haven't been assigned a team as admin yet. Use the Team ownership panel below to assign yourself a team.
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="panel">
              <h2>My Team</h2>
              {(() => {
                const myTeam = snapshot.teams.find((t) => t.ownerUserId === user.id);
                if (myTeam) {
                  return (
                    <details className="room-card" style={{ marginTop: "0.5rem", cursor: "pointer" }}>
                      <summary style={summaryButtonStyle}>
                        <strong>{myTeam.name}</strong>
                        <div className="subtle mono">{myTeam.shortCode}</div>
                        <div className="pill-row" style={{ marginTop: "0.5rem" }}>
                          <span className="pill highlight">{formatCurrencyShort(myTeam.purseRemaining)}</span>
                          <span className="pill">Squad limit: {myTeam.squadLimit}</span>
                        </div>
                      </summary>
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "grid", gap: "0.5rem" }}>
                        {snapshot.squads.filter(s => s.teamId === myTeam.id).length === 0 ? (
                          <div className="subtle" style={{ fontSize: "0.9rem" }}>No players bought yet.</div>
                        ) : (
                          snapshot.squads.filter(s => s.teamId === myTeam.id).map(s => {
                            const p = snapshot.players.find(x => x.id === s.playerId);
                            return (
                              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                                <span>{p?.name} <span className="subtle" style={{fontSize:"0.8rem"}}>{p?.role}</span></span>
                                <strong>{formatCurrencyShort(s.purchasePrice)}</strong>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </details>
                  );
                }
                return (
                  <>
                    <p className="subtle">
                      You don't own a team in this room yet. Configure your team below.
                    </p>
                    <SelfCreateTeamForm roomCode={snapshot.room.code} />
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="grid">
          <div className="panel" style={{ position: "relative", zIndex: 20, overflow: "visible" }}>
            <h2>Auction readiness</h2>
            <ReadinessPanel
              isAdmin={snapshot.currentMember.isAdmin}
              members={snapshot.members}
              phase={snapshot.auctionState?.phase ?? "WAITING"}
              players={snapshot.players}
              roomCode={snapshot.room.code}
              teams={snapshot.teams}
            />
            {snapshot.currentMember.isAdmin &&
            (snapshot.auctionState?.phase ?? "WAITING") === "WAITING" ? (
              <div style={{ marginTop: "1rem" }}>
                {snapshot.members.length === 1 ? (
                  <div className="notice" style={{ marginBottom: "0.75rem" }}>
                    Running solo — you control all teams. No other participants needed.
                  </div>
                ) : null}
                <StartAuctionButton
                  disabled={snapshot.players.length === 0 || snapshot.teams.length === 0}
                  roomCode={snapshot.room.code}
                />
              </div>
            ) : snapshot.auctionState?.phase !== "WAITING" ? (
              <div className="notice" style={{ marginTop: "1rem" }}>
                Auction is already {snapshot.auctionState?.phase.toLowerCase()}.
              </div>
            ) : (
              <div className="notice" style={{ marginTop: "1rem" }}>
                An admin needs to start the auction once players and teams are ready.
              </div>
            )}
          </div>

          <div className="panel" style={{ position: "relative", zIndex: 1 }}>
            <h2>Members</h2>
            <div className="member-grid">
              {snapshot.members.map((member) => (
                <div className="room-card" key={member.userId}>
                  <strong>{member.displayName ?? member.email ?? "Unnamed member"}</strong>
                  <div className="subtle">{deriveRoleLabel(member)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {snapshot.currentMember.isAdmin && (
        <section className="panel" style={{ marginTop: "1rem", borderColor: "rgba(183,121,31,0.3)", background: "rgba(183,121,31,0.04)" }}>
          <h2 style={{ marginTop: 0 }}>Import completed auction results</h2>
          <p className="subtle" style={{ marginBottom: "1rem" }}>
            Already ran your auction elsewhere? Upload the results workbook to populate
            teams, players, and squads in one step. All existing room data will be replaced
            and the auction will be marked complete.
          </p>
          <ImportResultsForm roomCode={snapshot.room.code} />
        </section>
      )}

      {snapshot.currentMember.isAdmin && snapshot.teams.length > 0 ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2>Team ownership</h2>
          <TeamOwnershipPanel
            members={snapshot.members}
            roomCode={snapshot.room.code}
            teams={snapshot.teams}
          />
        </section>
      ) : null}

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <div className="panel" style={{ padding: 0, background: "transparent", border: "none" }}>
          <SquadBoard
            teams={snapshot.teams}
            squads={snapshot.squads}
            players={snapshot.players}
            roomCode={snapshot.room.code}
            phase={snapshot.auctionState?.phase ?? "WAITING"}
            currentUserId={snapshot.user?.id ?? null}
            isAdmin={snapshot.currentMember.isAdmin}
            scrollable={false}
          />
        </div>

        <details className="panel" style={{ cursor: "pointer", transition: "all 0.2s ease" }}>
          <summary style={{ ...summaryButtonStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Player Pool ({snapshot.players.length})</h2>
            <span style={{ fontSize: "1.2rem", opacity: 0.7 }}>▾</span>
          </summary>
          <div style={{ marginTop: "1rem" }}>
            <PlayerPoolManager
              canManage={snapshot.currentMember.isAdmin}
              players={snapshot.players}
              roomCode={snapshot.room.code}
              teams={snapshot.teams}
            />
            {!snapshot.currentMember.isAdmin && (snapshot.players.length === 0 ? (
              <div className="empty-state">
                Upload a player sheet to populate round one and round two queues.
              </div>
            ) : (
              <div className="table-like">
                {snapshot.players.slice(0, 12).map((player) => (
                  <div className="room-card" key={player.id}>
                    <div className="header-row">
                      <strong>{player.name}</strong>
                      <span className="pill">{player.status}</span>
                    </div>
                    <div className="subtle">
                      {player.role}
                      {player.nationality ? ` • ${player.nationality}` : ""} •{" "}
                      {formatCurrency(player.basePrice)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      </section>

      {snapshot.teams.length > 1 && (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2 style={{ marginBottom: "0.2rem" }}>Player Trading</h2>
          <p className="subtle" style={{ marginBottom: "1.25rem" }}>
            Propose or accept player transfers. The auction does not need to be active.
          </p>
          <TradePanel
            currentUserId={snapshot.currentMember.userId}
            isAdmin={snapshot.currentMember.isAdmin}
            roomCode={snapshot.room.code}
            squads={snapshot.squads}
            teams={snapshot.teams}
            players={snapshot.players}
            trades={snapshot.trades}
          />
        </section>
      )}
    </main>
  );
}
