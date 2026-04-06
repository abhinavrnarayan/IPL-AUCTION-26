import { Skeleton, SkeletonRow, SkeletonStatStrip } from "@/components/ui/skeleton";
import { StuckAlert } from "@/components/ui/stuck-alert";

export default function AuctionLoading() {
  return (
    <main className="shell">
      {/* Nav bar */}
      <div className="nav">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Skeleton width={100} height={18} />
          <Skeleton width={160} height={12} />
        </div>
        <div className="link-row">
          <Skeleton width={68} height={34} />
          <Skeleton width={68} height={34} />
          <Skeleton width={80} height={34} />
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ marginTop: "1rem" }}>
        <SkeletonStatStrip tiles={4} />
      </div>

      {/* Main auction layout: player card + bid panel + squad board */}
      <div className="grid two" style={{ marginTop: "1rem", gap: "1rem" }}>
        {/* Player card */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton width={120} height={14} />
            <Skeleton width={60} height={22} />
          </div>
          <Skeleton block rounded height={80} width={80} style={{ margin: "0 auto" }} />
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
            <Skeleton width={200} height={28} />
            <Skeleton width={100} height={14} />
            <div className="pill-row" style={{ justifyContent: "center" }}>
              <Skeleton width={70} height={22} />
              <Skeleton width={90} height={22} />
            </div>
          </div>
          <SkeletonStatStrip tiles={4} />
        </div>

        {/* Bid panel */}
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton block height={18} width="50%" />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} cols={3} />
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <Skeleton block height={44} />
            <Skeleton block height={44} />
          </div>
        </div>
      </div>

      {/* Squad board skeleton */}
      <div className="panel" style={{ marginTop: "1rem" }}>
        <Skeleton block height={18} width="30%" style={{ marginBottom: "1rem" }} />
        <div className="grid two">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="panel" style={{ padding: "0.75rem" }}>
              <Skeleton block height={14} width="60%" style={{ marginBottom: "0.5rem" }} />
              {[1, 2, 3].map((j) => (
                <SkeletonRow key={j} cols={2} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <StuckAlert delayMs={5000} />
    </main>
  );
}
