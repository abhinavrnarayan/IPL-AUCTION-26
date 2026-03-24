import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { ResultsBoard } from "@/components/results/results-board";
import { hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getResultsSnapshot } from "@/lib/server/queries";

export default async function ResultsPage({
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
            Add the Supabase service role key before opening the results view.
          </p>
          <Link className="button" href="/lobby">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  const snapshot = await getResultsSnapshot(code, user);

  if (!snapshot) {
    return (
      <main className="shell">
        <div className="panel">
          <h1 className="page-title">Results unavailable</h1>
          <p className="subtle">
            Join the room first or complete some auction activity before opening
            results.
          </p>
          <Link className="button" href={`/room/${code}`}>
            Back to room
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="nav">
        <div>
          <div className="brand"><SiteLogo suffix="Results" /></div>
          <div className="subtle mono">{snapshot.room.code}</div>
        </div>
        <div className="link-row">
          <Link className="button ghost" href={`/room/${snapshot.room.code}`}>
            Room
          </Link>
          <Link className="button secondary" href={`/auction/${snapshot.room.code}`}>
            Auction
          </Link>
        </div>
      </div>
      <ResultsBoard snapshot={snapshot} />
    </main>
  );
}
