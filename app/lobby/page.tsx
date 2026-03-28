import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { signOutAction } from "@/app/login/actions";
import { CreateRoomForm } from "@/components/lobby/create-room-form";
import { JoinRoomForm } from "@/components/lobby/join-room-form";
import { RoomCardList } from "@/components/lobby/room-card-list";
import { hasBrowserSupabaseEnv, hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getLobbySnapshot } from "@/lib/server/queries";
import { getSupabaseSchemaStatus } from "@/lib/supabase/schema";

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
        <RoomCardList rooms={snapshot.rooms} />
      </section>
    </main>
  );
}
