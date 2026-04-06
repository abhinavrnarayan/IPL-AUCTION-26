import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { StuckAlert } from "@/components/ui/stuck-alert";

export default function LobbyLoading() {
  return (
    <main className="shell">
      {/* Nav */}
      <div className="nav">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Skeleton width={120} height={18} />
          <Skeleton width={160} height={12} />
        </div>
        <div className="button-row">
          <Skeleton width={64} height={34} />
          <Skeleton width={80} height={34} />
        </div>
      </div>

      {/* Create / Join panels */}
      <section className="grid two" style={{ marginTop: "1rem" }}>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton block height={20} width="50%" />
          <Skeleton block height={12} />
          <Skeleton block height={12} width="80%" />
          <Skeleton block height={38} style={{ marginTop: "0.5rem" }} />
        </div>
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Skeleton block height={20} width="50%" />
          <Skeleton block height={12} />
          <Skeleton block height={12} width="80%" />
          <Skeleton block height={38} style={{ marginTop: "0.5rem" }} />
        </div>
      </section>

      {/* Room list */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <Skeleton block height={20} width="30%" style={{ marginBottom: "1rem" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>

      <StuckAlert />
    </main>
  );
}
