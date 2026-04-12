import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { ImportResultsForm } from "@/components/room/import-results-form";
import { MyTeamPanel } from "@/components/room/my-team-panel";
import { ReadinessPanel } from "@/components/room/readiness-panel";
import { RoomInvitePanel } from "@/components/room/room-invite-panel";
import { RoomAuctionExportButton } from "@/components/room/room-auction-export-button";
import { StartAuctionButton } from "@/components/room/start-auction-button";
import { TeamOwnershipPanel } from "@/components/room/team-ownership-panel";
import { PointsSyncPanel } from "@/components/room/points-sync-panel";
import { CricsheetSyncButton } from "@/components/room/cricsheet-sync-button";
import { WebscrapeSyncPanel } from "@/components/room/webscrape-sync-panel";
import { CollapsibleSection } from "@/components/room/collapsible-section";
import { SelfCreateTeamForm } from "@/components/room/self-create-team-form";
import { TradePanel } from "@/components/trades/trade-panel";
import { DashboardAutoRefresher } from "@/components/dashboard-auto-refresher";
import { SquadBoard } from "@/components/auction/squad-board";
import { SoldPlayerShowcase } from "@/components/sold-player-showcase";
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
          <h1 className="page-title">Room setup is not ready</h1>
          <p className="subtle">
            Finish the remaining setup before opening room controls.
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
          <h1 className="page-title">Join this room first</h1>
          <p className="subtle">
            Enter this room from the lobby first so your access is ready.
          </p>
          <Link className="button" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  const soldShowcaseItems = snapshot.squads
    .map((entry) => {
      const player = snapshot.players.find((item) => item.id === entry.playerId);
      const team = snapshot.teams.find((item) => item.id === entry.teamId);
      return {
        id: entry.id,
        playerName: player?.name ?? "Unknown player",
        teamCode: team?.shortCode ?? "?",
        teamName: team?.name ?? null,
        amount: entry.purchasePrice,
        role: player?.role ?? null,
      };
    });

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
          {snapshot.currentMember.isAdmin ? (
            <RoomAuctionExportButton
              room={snapshot.room}
              players={snapshot.players}
              squads={snapshot.squads}
              teams={snapshot.teams}
            />
          ) : null}
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
            <span className="eyebrow">Room setup</span>
            <h1 className="page-title" style={{ fontSize: "3.2rem", marginTop: "0.4rem" }}>
              Get the room ready
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
        {snapshot.auctionState?.phase === "COMPLETED" ? (
          <div className="notice success" style={{ marginTop: "1rem" }}>
            Auction complete. Start auction again whenever you want to reopen the room.
          </div>
        ) : null}
      </section>

      {snapshot.currentMember.isAdmin ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <RoomInvitePanel
            roomCode={snapshot.room.code}
            roomName={snapshot.room.name}
          />
        </section>
      ) : null}

      {soldShowcaseItems.length > 0 ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <SoldPlayerShowcase
            items={soldShowcaseItems}
            title="Top sold players"
            variant="cards"
          />
        </section>
      ) : null}

      <section className="split" style={{ marginTop: "1rem" }}>
        <div className="grid">
          {snapshot.currentMember.isAdmin ? (
            <>
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
                      <MyTeamPanel
                        isAdmin
                        players={snapshot.players}
                        roomCode={snapshot.room.code}
                        squads={snapshot.squads}
                        team={myTeam}
                      />
                    );
                  }
                return (
                  <div className="subtle" style={{ fontSize: "0.9rem" }}>
                      You do not have a team yet. Assign one below to see your squad here.
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
                    <MyTeamPanel
                      isAdmin={false}
                      players={snapshot.players}
                      roomCode={snapshot.room.code}
                      squads={snapshot.squads}
                      team={myTeam}
                    />
                  );
                }
                return (
                  <>
                    <p className="subtle">
                      You do not have a team in this room yet. Create one below to get started.
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
              squadSize={snapshot.room.squadSize}
              timerSeconds={snapshot.room.timerSeconds}
              teams={snapshot.teams}
            />
            {snapshot.currentMember.isAdmin &&
            ["WAITING", "ROUND_END", "COMPLETED"].includes(
              snapshot.auctionState?.phase ?? "WAITING",
            ) ? (
              <div style={{ marginTop: "1rem" }}>
                {snapshot.members.length === 1 ? (
                  <div className="notice" style={{ marginBottom: "0.75rem" }}>
                    Solo mode is ready. You can control all teams yourself.
                  </div>
                ) : null}
                <StartAuctionButton
                  disabled={snapshot.players.length === 0 || snapshot.teams.length === 0}
                  label={
                    (snapshot.auctionState?.phase ?? "WAITING") === "WAITING"
                      ? "Start auction"
                      : "Start auction again"
                  }
                  roomCode={snapshot.room.code}
                />
              </div>
            ) : snapshot.auctionState?.phase !== "WAITING" ? (
              <div className="notice" style={{ marginTop: "1rem" }}>
                The auction is already {snapshot.auctionState?.phase.toLowerCase()}.
              </div>
            ) : (
              <div className="notice" style={{ marginTop: "1rem" }}>
                An admin can start the auction once the room is ready.
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
          <h2 style={{ marginTop: 0 }}>Import past results</h2>
          <p className="subtle" style={{ marginBottom: "1rem" }}>
            Upload a completed auction sheet to fill teams, players, and squads in one step.
          </p>
          <ImportResultsForm roomCode={snapshot.room.code} />
        </section>
      )}


      {snapshot.currentMember.isAdmin && snapshot.teams.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <CollapsibleSection title="Team ownership" accentColor="rgba(255,255,255,0.1)">
            <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
              Assign joined room members to teams. Each member can only own one team at a time.
            </p>
            <TeamOwnershipPanel
              members={snapshot.members}
              roomCode={snapshot.room.code}
              teams={snapshot.teams}
            />
          </CollapsibleSection>
        </div>
      ) : null}

      {/* ── Score Sync: available to all room admins ── */}
      {snapshot.currentMember.isAdmin ? (
        <div style={{ marginTop: "1rem" }}>
          <CollapsibleSection
            title="Score Sync"
            eyebrow="Points management"
            accentColor="rgba(99,102,241,0.3)"
          >
            <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
              Reset clears all player points. Update Scores rebuilds from stored match data.
            </p>
            <PointsSyncPanel roomCode={snapshot.room.code} />
          </CollapsibleSection>
        </div>
      ) : null}

      {/* ── Super-room only: Cricsheet + Live Score data sources ── */}
      {snapshot.currentMember.isAdmin && snapshot.room.isSuperRoom ? (
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <CollapsibleSection
            title="Cricsheet Sync"
            eyebrow="Ball-by-ball data"
            badge="Sandbox only"
            accentColor="rgba(56,189,248,0.25)"
          >
            <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
              Download the IPL season from Cricsheet and sync player stats into this room.
            </p>
            <CricsheetSyncButton roomCode={snapshot.room.code} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Live Score Sync"
            eyebrow="Live API data"
            badge="Sandbox only"
            accentColor="rgba(99,220,120,0.25)"
          >
            <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
              Fetch live match scores from API providers, compare sources, and accept the one you trust for each match.
            </p>
            <WebscrapeSyncPanel roomCode={snapshot.room.code} />
          </CollapsibleSection>
        </div>
      ) : null}

      <div style={{ marginTop: "1rem" }}>
        <CollapsibleSection title="Dream Team Boards" eyebrow="Team-wise leaderboards" accentColor="rgba(255,255,255,0.1)">
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
        </CollapsibleSection>
      </div>

      {snapshot.teams.length > 1 && (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2 style={{ marginBottom: "0.2rem" }}>Player Trading</h2>
          <p className="subtle" style={{ marginBottom: "1.25rem" }}>
            Propose and accept player swaps between teams.
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
