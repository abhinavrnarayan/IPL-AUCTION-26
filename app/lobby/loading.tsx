import { SkeletonCard, SkeletonRow } from "@/components/ui/skeleton";

export default function LobbyLoading() {
  return (
    <main className="shell">
      <div className="nav">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <div style={{ height: "1.8rem", width: "180px", borderRadius: 6, background: "rgba(99,102,241,0.1)" }} />
          <div style={{ height: "0.9rem", width: "140px", borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />
        </div>
      </div>

      <section className="grid two" style={{ marginTop: "1rem" }}>
        <SkeletonCard />
        <SkeletonCard />
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div style={{ height: "1.2rem", width: "100px", borderRadius: 4, background: "rgba(99,102,241,0.1)", marginBottom: "1rem" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} cols={4} />
          ))}
        </div>
      </section>
    </main>
  );
}
