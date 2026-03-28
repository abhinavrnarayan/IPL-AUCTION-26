import Link from "next/link";

export const dynamic = "force-dynamic";

import { AuctionRoomClient } from "@/components/auction/auction-room-client";
import { hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getAuctionSnapshot } from "@/lib/server/queries";

export default async function AuctionPage({
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
            Add the Supabase service role key before opening the live auction.
          </p>
          <Link className="button" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  const snapshot = await getAuctionSnapshot(code, user);

  if (!snapshot) {
    return (
      <main className="shell">
        <div className="panel">
          <h1 className="page-title">Auction not ready</h1>
          <p className="subtle">
            Start the room auction from the setup page after players and teams
            have been uploaded.
          </p>
          <Link className="button" href={`/room/${code}`}>
            Go to room setup
          </Link>
        </div>
      </main>
    );
  }

  return <AuctionRoomClient snapshot={snapshot} />;
}
