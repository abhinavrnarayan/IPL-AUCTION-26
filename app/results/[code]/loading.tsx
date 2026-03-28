import { SkeletonRow, SkeletonStatStrip } from "@/components/ui/skeleton";

export default function ResultsLoading() {
  return (
    <main className="shell">
      <div className="nav" style={{ marginBottom: "1.5rem" }}>
        <div style={{ height: "1.5rem", width: "120px", borderRadius: 5, background: "rgba(99,102,241,0.1)" }} />
      </div>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <div style={{ height: "3rem", width: "60%", borderRadius: 6, background: "rgba(99,102,241,0.1)", marginBottom: "1rem" }} />
        <SkeletonStatStrip tiles={4} />
      </section>

      <section className="grid two">
        <div className="panel">
          <div style={{ height: "1.1rem", width: "140px", borderRadius: 4, background: "rgba(99,102,241,0.1)", marginBottom: "1rem" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} cols={3} />
            ))}
          </div>
        </div>
        <div className="panel">
          <div style={{ height: "1.1rem", width: "120px", borderRadius: 4, background: "rgba(99,102,241,0.1)", marginBottom: "1rem" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} cols={2} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
