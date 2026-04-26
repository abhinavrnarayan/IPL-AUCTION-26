import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { ImportResultsForm } from "@/components/room/import-results-form";
import { MyTeamPanel } from "@/components/room/my-team-panel";
import { ReadinessPanel } from "@/components/room/readiness-panel";
import { RoomInvitePanel } from "@/components/room/room-invite-panel";
import { RoomAuctionExportButton } from "@/components/room/room-auction-export-button";
import { StartAuctionButton } from "@/components/room/start-auction-button";
import { TeamOwnershipPanel } from "@/components/room/team-ownership-panel";
import { CollapsibleSection } from "@/components/room/collapsible-section";
import { DrawerSection } from "@/components/room/drawer-section";
import { SelfCreateTeamForm } from "@/components/room/self-create-team-form";
import { TradePanel } from "@/components/trades/trade-panel";
import { SoldPlayerShowcase } from "@/components/sold-player-showcase";
import { hasServiceRoleEnv } from "@/lib/config";
import { auctionPhaseLabel } from "@/lib/domain/types";
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
          <Link className="button ghost" href="/profile">
            Profile
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
            <h1 className="page-title" style={{ fontSize: "clamp(1.6rem, 6vw, 3.2rem)", marginTop: "0.4rem" }}>
              Get the room ready
            </h1>
          </div>
          <div className="pill-row">
            <span className="pill">{deriveRoleLabel(snapshot.currentMember)}</span>
            <span className="pill highlight">
              {auctionPhaseLabel(snapshot.auctionState?.phase)}
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
            ["WAITING", "COMPLETED"].includes(
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
            ) : snapshot.currentMember.isAdmin && snapshot.auctionState?.phase === "ROUND_END" ? (
              <div className="notice" style={{ marginTop: "1rem" }}>
                Status: {auctionPhaseLabel(snapshot.auctionState.phase)}.{" "}
                <Link href={`/auction/${snapshot.room.code}`}>Open auction controls</Link>
                {" "}to continue the next round or complete the auction.
              </div>
            ) : snapshot.auctionState?.phase !== "WAITING" ? (
              <div className="notice" style={{ marginTop: "1rem" }}>
                Status: {auctionPhaseLabel(snapshot.auctionState?.phase)}.
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
        <div style={{ marginTop: "1rem" }}>
          <DrawerSection
            title="Import past results"
            eyebrow="Bulk upload"
            summary={
              <span className="subtle" style={{ fontSize: "0.82rem" }}>
                Upload a completed auction sheet to fill teams, players, and squads in one step.
              </span>
            }
            accentColor="rgba(183,121,31,0.3)"
            width="min(600px, 100vw)"
          >
            <ImportResultsForm roomCode={snapshot.room.code} />
          </DrawerSection>
        </div>
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


{snapshot.teams.length > 1 && (
        <div style={{ marginTop: "1rem" }}>
          <DrawerSection
            title="Player Trading"
            eyebrow="Propose and accept player swaps"
            summary={
              <div className="pill-row" style={{ marginTop: "0.3rem" }}>
                <span className="pill">{snapshot.trades.length} trade{snapshot.trades.length !== 1 ? "s" : ""}</span>
                <span className="pill">{snapshot.trades.filter((t) => t.status === "PENDING").length} pending</span>
              </div>
            }
            accentColor="rgba(183,121,31,0.25)"
            width="min(820px, 100vw)"
          >
            <TradePanel
              currentUserId={snapshot.currentMember.userId}
              isAdmin={snapshot.currentMember.isAdmin}
              roomCode={snapshot.room.code}
              squads={snapshot.squads}
              teams={snapshot.teams}
              players={snapshot.players}
              trades={snapshot.trades}
            />
          </DrawerSection>
        </div>
      )}
    </main>
  );
}
