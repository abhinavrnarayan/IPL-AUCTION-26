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
          Add <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> to{" "}
          <span className="mono">.env.local</span> before using room creation,
          uploads, bidding, and results pages.
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
          Supabase auth is working, but the IPL schema is not installed in this
          project yet.
        </div>
        <div className="notice warning" style={{ marginTop: "1rem" }}>
          Run <span className="mono">supabase/migrations/001_initial_schema.sql</span>
          {" "}
          in the Supabase SQL editor for this project before using lobby and room
          features.
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
          Supabase env is incomplete. Create <span className="mono">.env.local</span>
          {" "}
          from the example file before using room features.
        </div>
      ) : null}

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <div className="panel">
          <h2>Create a room</h2>
          <p className="subtle">
            Start a private auction room with its own purse, squad cap, timer,
            and fixed increment rules.
          </p>
          <CreateRoomForm />
        </div>

        <div className="panel">
          <h2>Join by code</h2>
          <p className="subtle">
            Players can jump into an existing room with a short code and default
            player permissions.
          </p>
          <JoinRoomForm />
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Your rooms</h2>
        {snapshot.rooms.length === 0 ? (
          <div className="empty-state">
            No rooms yet. Create one above or join with a shared code.
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
