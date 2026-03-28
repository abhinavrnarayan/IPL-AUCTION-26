import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { signOutAction } from "@/app/login/actions";
import { CreateRoomForm } from "@/components/lobby/create-room-form";
import { JoinRoomForm } from "@/components/lobby/join-room-form";
import { hasBrowserSupabaseEnv, hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getLobbySnapshot } from "@/lib/server/queries";
import { getSupabaseSchemaStatus } from "@/lib/supabase/schema";
import { deriveRoleLabel, formatCurrency } from "@/lib/utils";

export default async function LobbyPage() {
  const user = await requireSessionUser();

  if (!hasServiceRoleEnv) {
    return (
      <main className="shell">
        <div className="nav">
          <div>
            <div className="brand"><SiteLogo suffix="Lobby" /></div>
            <div className="subtle">
              {user.displayName ?? user.email ?? "Signed-in user"}
            </div>
          </div>
        </div>
        <div className="notice warning">
          The lobby is not ready yet. Finish the remaining setup to create and manage rooms.
        </div>
      </main>
    );
  }

  const schemaStatus = await getSupabaseSchemaStatus();

  if (!schemaStatus.ready) {
    return (
      <main className="shell">
        <div className="nav">
          <div>
            <div className="brand"><SiteLogo suffix="Lobby" /></div>
            <div className="subtle">
              {user.displayName ?? user.email ?? "Signed-in user"}
            </div>
          </div>
        </div>
        <div className="notice warning">
          The lobby setup is incomplete right now.
        </div>
        <div className="notice warning" style={{ marginTop: "1rem" }}>
          Finish the database setup before using rooms, auctions, and results.
          {schemaStatus.missingTable ? (
            <>
              {" "}
              Missing table: <span className="mono">public.{schemaStatus.missingTable}</span>.
            </>
          ) : null}
        </div>
      </main>
    );
  }

  const snapshot = await getLobbySnapshot(user);

  return (
    <main className="shell">
      <div className="nav">
        <div>
          <div className="brand">Lobby</div>
          <div className="subtle">
            {user.displayName ?? user.email ?? "Signed-in user"}
          </div>
        </div>
        <div className="button-row">
          <Link className="button ghost" href="/">
            Home
          </Link>
          <form action={signOutAction}>
            <button className="button ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {!hasBrowserSupabaseEnv || !hasServiceRoleEnv ? (
        <div className="notice warning">
          Some room features are still being prepared.
        </div>
      ) : null}

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <div className="panel">
          <h2>Create a room</h2>
          <p className="subtle">
            Start a private SFL room with its own purse, squad size, timer, and auction settings.
          </p>
          <CreateRoomForm />
        </div>

        <div className="panel">
          <h2>Join by code</h2>
          <p className="subtle">
            Enter a room code and join the auction with your group.
          </p>
          <JoinRoomForm />
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Your rooms</h2>
        {snapshot.rooms.length === 0 ? (
          <div className="empty-state">
            No rooms yet. Create one above or join a room with a code.
          </div>
        ) : (
          <div className="card-list">
            {snapshot.rooms.map((summary) => (
              <Link
                key={summary.room.id}
                className="room-card"
                href={`/room/${summary.room.code}`}
              >
                <div className="header-row">
                  <div>
                    <strong>{summary.room.name}</strong>
                    <div className="subtle mono">{summary.room.code}</div>
                  </div>
                  <div className="pill-row">
                    <span className="pill">
                      {deriveRoleLabel({
                        isAdmin: summary.isAdmin,
                        isPlayer: summary.isPlayer,
                      })}
                    </span>
                    {summary.auctionPhase === "COMPLETED" ? (
                      <span
                        className="pill"
                        style={{
                          color: "#fcd34d",
                          borderColor: "rgba(245,158,11,0.28)",
                          background: "rgba(245,158,11,0.08)",
                        }}
                      >
                        Auction complete
                      </span>
                    ) : null}
                    <span className="pill highlight">
                      {formatCurrency(summary.room.purse)}
                    </span>
                  </div>
                </div>
                <div className="stats-strip" style={{ marginTop: "0.9rem" }}>
                  <div className="stat-tile">
                    <strong>{summary.memberCount}</strong>
                    Members
                  </div>
                  <div className="stat-tile">
                    <strong>{summary.teamCount}</strong>
                    Teams
                  </div>
                  <div className="stat-tile">
                    <strong>{summary.room.squadSize}</strong>
                    Squad size
                  </div>
                  <div className="stat-tile">
                    <strong>{summary.room.timerSeconds}s</strong>
                    Bid timer
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
