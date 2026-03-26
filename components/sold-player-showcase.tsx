"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatCurrencyShort } from "@/lib/utils";

export type SoldShowcaseItem = {
  id: string;
  playerName: string;
  teamCode: string;
  teamName?: string | null;
  amount: number;
  role?: string | null;
};

export function SoldPlayerShowcase({
  items,
  title,
  variant,
}: {
  items: SoldShowcaseItem[];
  title?: string;
  variant: "ticker" | "cards";
}) {
  const orderedItems = useMemo(
    () => [...items].sort((left, right) => right.amount - left.amount || left.playerName.localeCompare(right.playerName)),
    [items],
  );
  const [selectedId, setSelectedId] = useState<string | null>(orderedItems[0]?.id ?? null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const pauseUntilRef = useRef(0);

  const selectedItem =
    orderedItems.find((item) => item.id === selectedId) ?? orderedItems[0] ?? null;
  const renderedItems = useMemo(() => [...orderedItems, ...orderedItems], [orderedItems]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || orderedItems.length < 2) return;

    const resetToStart = () => {
      node.scrollLeft = 0;
    };

    resetToStart();

    const step = () => {
      const segmentWidth = node.scrollWidth / 2;
      if (Date.now() >= pauseUntilRef.current) {
        node.scrollLeft += variant === "ticker" ? 0.35 : 0.25;
      }

      if (node.scrollLeft >= segmentWidth) {
        node.scrollLeft -= segmentWidth;
      } else if (node.scrollLeft <= 0 && Date.now() < pauseUntilRef.current) {
        node.scrollLeft = segmentWidth;
      }

      autoScrollRef.current = window.requestAnimationFrame(step);
    };

    autoScrollRef.current = window.requestAnimationFrame(step);

    return () => {
      if (autoScrollRef.current !== null) {
        window.cancelAnimationFrame(autoScrollRef.current);
      }
    };
  }, [orderedItems, variant]);

  function pauseAutoScroll() {
    pauseUntilRef.current = Date.now() + 2500;
  }

  if (orderedItems.length === 0) {
    return null;
  }

  return (
    <div className={`sold-showcase sold-showcase-${variant}`}>
      {title ? (
        <div className="sold-showcase-head">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span className="subtle" style={{ fontSize: "0.8rem" }}>
            Highest sold prices first. Click any item for details.
          </span>
        </div>
      ) : null}

      <div className="sold-showcase-slider">
        <div
          className="sold-showcase-scroller"
          onMouseEnter={pauseAutoScroll}
          onPointerDown={pauseAutoScroll}
          onScroll={pauseAutoScroll}
          onTouchStart={pauseAutoScroll}
          ref={scrollerRef}
        >
          <div className="sold-showcase-track">
            {renderedItems.map((item, index) => (
              <button
                className={`sold-showcase-item${selectedItem?.id === item.id ? " active" : ""}`}
                key={`${item.id}-${index}`}
                onClick={() => {
                  pauseAutoScroll();
                  setSelectedId(item.id);
                }}
                type="button"
              >
                <span className="sold-showcase-badge">SOLD</span>
                <strong>{item.playerName}</strong>
                <span className="subtle">{item.teamCode}</span>
                <span className="sold-showcase-price">{formatCurrencyShort(item.amount)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div className="sold-showcase-detail">
          <div>
            <div className="sold-showcase-detail-title">{selectedItem.playerName}</div>
            <div className="subtle" style={{ fontSize: "0.82rem" }}>
              {selectedItem.teamName ?? selectedItem.teamCode}
              {selectedItem.role ? ` • ${selectedItem.role}` : ""}
            </div>
          </div>
          <div className="sold-showcase-detail-price">
            {formatCurrencyShort(selectedItem.amount)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
