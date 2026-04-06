import type React from "react";
import styles from "./skeleton.module.css";

export function Skeleton({
  width,
  height,
  rounded = false,
  block = false,
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  block?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={[
        styles.skeleton,
        rounded ? styles.rounded : "",
        block ? styles.block : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** Pre-built skeleton layouts for common patterns */
export function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center", padding: "0.75rem 0" }}>
      <Skeleton width={28} height={28} rounded />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <Skeleton block height={14} />
        <Skeleton width="60%" height={11} />
      </div>
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Skeleton key={i} width={56} height={20} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      className="panel"
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1.2rem" }}
    >
      <Skeleton block height={16} width="50%" />
      <Skeleton block height={12} />
      <Skeleton block height={12} width="80%" />
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
        <Skeleton width={56} height={22} />
        <Skeleton width={72} height={22} />
        <Skeleton width={48} height={22} />
      </div>
    </div>
  );
}

export function SkeletonStatStrip({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="stats-strip">
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="stat-tile" style={{ gap: "0.4rem" }}>
          <Skeleton block height={22} width="70%" />
          <Skeleton block height={11} width="50%" />
        </div>
      ))}
    </div>
  );
}
