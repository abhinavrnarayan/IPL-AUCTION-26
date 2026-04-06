import { Skeleton, SkeletonRow, SkeletonStatStrip } from "@/components/ui/skeleton";
import { StuckAlert } from "@/components/ui/stuck-alert";

export default function RoomLoading() {
  return (
    <main className="shell">
      {/* Nav */}
      <div className="nav">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Skeleton width={100} height={18} />
          <Skeleton width={180} height={14} />
          <Skeleton width={80} height={11} />
        </div>
        <div className="link-row">
          <Skeleton width={68} height={34} />
          <Skeleton width={80} height={34} />
          <Skeleton width={120} height={34} />
        </div>
      </div>

      {/* Room header panel */}
      <section className="panel" style={{ marginTop: "1rem" }}>
        <div className="header-row" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Skeleton width={80} height={11} />
            <Skeleton width={260} height={40} />
          </div>
          <div className="pill-row">
            <Skeleton width={70} height={24} />
            <Skeleton width={90} height={24} />
          </div>
        </div>
        <SkeletonStatStrip tiles={4} />
      </section>

      {/* Setup sections */}
      <section className="split" style={{ marginTop: "1rem" }}>
        <div className="grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <Skeleton block height={18} width="45%" />
              <Skeleton block height={12} />
              <Skeleton block height={12} width="70%" />
              <Skeleton block height={36} style={{ marginTop: "0.25rem" }} />
            </div>
          ))}
        </div>
        <div className="grid">
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Skeleton block height={18} width="50%" />
            {[1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} cols={2} />
            ))}
          </div>
          <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <Skeleton block height={18} width="35%" />
            {[1, 2, 3].map((i) => (
              <SkeletonRow key={i} cols={1} />
            ))}
          </div>
        </div>
      </section>

      <StuckAlert />
    </main>
  );
}
