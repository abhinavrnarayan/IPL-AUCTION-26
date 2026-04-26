import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

import { ResultsBoard } from "@/components/results/results-board";
import { ResultsExportBar } from "@/components/results/results-export-bar";
import { ResultsResetButton } from "@/components/results/results-reset-button";
import { UpdateScoresButton } from "@/components/results/update-scores-button";
import { CollapsibleSection } from "@/components/room/collapsible-section";
import { LiveScoreSyncDrawer } from "@/components/room/live-score-sync-drawer";
import { PointsSyncPanel } from "@/components/room/points-sync-panel";
import { hasServiceRoleEnv } from "@/lib/config";
import { requireSessionUser } from "@/lib/server/auth";
import { getResultsSnapshot } from "@/lib/server/queries";
import { getFeatureFlags } from "@/lib/server/settings";

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

  const [snapshot, flags] = await Promise.all([
    getResultsSnapshot(code, user),
    getFeatureFlags(),
  ]);

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
          <div className="subtle" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{snapshot.room.name}</div>
          <div className="subtle mono">{snapshot.room.code}</div>
        </div>
        <div className="link-row">
          <Link className="button ghost" href={`/room/${snapshot.room.code}`}>
            Room
          </Link>
          <Link className="button secondary" href={`/auction/${snapshot.room.code}`}>
            Auction
          </Link>
          {/* Visible to all members when superadmin has the flag enabled,
              or always to admins (they can use Reset Points for a full rebuild) */}
          {(flags.user_score_fetch || snapshot.currentMember?.isAdmin) ? (
            <UpdateScoresButton roomCode={snapshot.room.code} />
          ) : null}
          {snapshot.currentMember?.isAdmin ? (
            <ResultsResetButton roomCode={snapshot.room.code} />
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 0.5rem" }}>
        <ResultsExportBar snapshot={snapshot} />
      </div>
      <ResultsBoard snapshot={snapshot} />

      {snapshot.currentMember?.isAdmin ? (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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

          <LiveScoreSyncDrawer
            roomCode={snapshot.room.code}
            initialProviders={[
              { id: "rapidapi", label: "RapidAPI / Cricbuzz", configured: Boolean(process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY_2) },
              { id: "cricsheet", label: "Cricsheet (ball-by-ball)", configured: true },
            ]}
          />

        </div>
      ) : null}
    </main>
  );
}
