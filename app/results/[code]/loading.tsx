import { Skeleton, SkeletonRow } from "@/components/ui/skeleton";
import { StuckAlert } from "@/components/ui/stuck-alert";

export default function ResultsLoading() {
  return (
    <main className="shell">
      {/* Nav */}
      <div className="nav">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Skeleton width={110} height={18} />
          <Skeleton width={80} height={12} />
        </div>
        <div className="link-row">
          <Skeleton width={68} height={34} />
          <Skeleton width={90} height={34} />
          <Skeleton width={80} height={34} />
        </div>
      </div>

      {/* Export bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 0 0.5rem", gap: "0.5rem" }}>
        <Skeleton width={120} height={32} />
        <Skeleton width={100} height={32} />
      </div>

      {/* Leaderboard panel */}
      <div className="panel">
        <Skeleton block height={22} width="40%" style={{ marginBottom: "1.25rem" }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ borderBottom: "1px solid rgba(99,102,241,0.08)", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
            <SkeletonRow key={i} cols={4} />
          </div>
        ))}
      </div>

      {/* Player breakdown skeleton */}
      <div className="panel" style={{ marginTop: "1rem" }}>
        <Skeleton block height={18} width="35%" style={{ marginBottom: "1rem" }} />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonRow key={i} cols={3} />
        ))}
      </div>

      <StuckAlert />
    </main>
  );
}
