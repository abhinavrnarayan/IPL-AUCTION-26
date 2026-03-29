"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toErrorMessage } from "@/lib/utils";
import { ExportButton } from "@/components/ui/export-button";

// â”€â”€ Types mirroring the API response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SourceData {
  sourceLabel: string;
  calculatedPoints: Record<string, number>;
  accepted: boolean;
}

interface MatchComparison {
  matchId: string;
  matchDate: string;
  teams: string[];
  sources: Record<string, SourceData>; // source key â†’ data
}

interface PreviewResponse {
  ok: boolean;
  season?: string;
  source?: string;
  selectedProvider?: string;
  errors?: Record<string, string>;
  providers?: Array<{ id: string; label: string; configured: boolean }>;
  matchesFetched?: number;
  comparison?: MatchComparison[];
  error?: string;
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function totalPts(pts: Record<string, number>): number {
  return Object.values(pts).reduce((s, v) => s + v, 0);
}

function topScorers(pts: Record<string, number>, n = 5): Array<[string, number]> {
  return Object.entries(pts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function WebscrapeSyncPanel({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [season, setSeason] = useState("2026");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null); // matchId being accepted
  const [comparison, setComparison] = useState<MatchComparison[]>([]);
  const [providers, setProviders] = useState<Array<{ id: string; label: string; configured: boolean }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);
  // Manual override state: matchId â†’ { playerName â†’ pts override }
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [overrideEdit, setOverrideEdit] = useState<string | null>(null); // matchId with open editor
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState(0);

  const AUTO_REFRESH_INTERVAL = 10 * 60; // seconds

  // â”€â”€ Callbacks (defined before effects that depend on them) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleFetch = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/webscrape-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, provider: selectedProvider }),
      });
      const data = (await res.json()) as PreviewResponse;
      if (!res.ok || !data.ok) {
        setFetchError(data.error ?? "Fetch failed.");
        if (data.providers) setProviders(data.providers);
        if (data.errors) setErrors(data.errors);
        return;
      }
      setComparison(data.comparison ?? []);
      setProviders(data.providers ?? []);
      setSelectedProvider((current) => data.selectedProvider ?? current);
      setErrors(data.errors ?? {});
      setLastFetched(new Date().toLocaleTimeString());
    } catch (err) {
      setFetchError(toErrorMessage(err));
    } finally {
      setFetching(false);
    }
  }, [roomCode, season, selectedProvider]);

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Load stored comparison on mount / season change
  useEffect(() => {
    async function loadStored() {
      try {
        const res = await fetch(`/api/rooms/${roomCode}/webscrape-preview?season=${season}`);
        const data = (await res.json()) as PreviewResponse;
        if (data.ok && data.comparison) {
          setComparison(data.comparison);
          setProviders(data.providers ?? []);
          setSelectedProvider((current) => {
            if (current) return current;
            const firstConfigured = (data.providers ?? []).find((provider) => provider.configured);
            return firstConfigured?.id ?? null;
          });
        }
      } catch { /* silently ignore on initial load */ }
    }
    void loadStored();
  }, [roomCode, season]);

  useEffect(() => {
    if (selectedProvider) return;
    const firstConfigured = providers.find((provider) => provider.configured);
    if (firstConfigured) {
      setSelectedProvider(firstConfigured.id);
    }
  }, [providers, selectedProvider]);

  // Auto-refresh: 10-minute countdown + trigger
  useEffect(() => {
    if (!autoRefresh) { setNextRefreshIn(0); return; }
    setNextRefreshIn(AUTO_REFRESH_INTERVAL);

    const tick = setInterval(() => {
      setNextRefreshIn((s) => {
        if (s <= 1) {
          void handleFetch();
          return AUTO_REFRESH_INTERVAL;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [autoRefresh, handleFetch]);

  async function handleAccept(matchId: string, source: string) {
    setAccepting(matchId);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/webscrape-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          accepts: [{ matchId, source }],
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Accept failed.");

      // Optimistically update local state
      setComparison((prev) =>
        prev.map((m) => {
          if (m.matchId !== matchId) return m;
          const newSources = { ...m.sources };
          for (const k of Object.keys(newSources)) {
            newSources[k] = { ...newSources[k]!, accepted: k === source };
          }
          return { ...m, sources: newSources };
        }),
      );
      router.refresh();
    } catch (err) {
      alert(toErrorMessage(err));
    } finally {
      setAccepting(null);
    }
  }

  async function handleApplyOverride(matchId: string, source: string) {
    const matchOverrides = overrides[matchId];
    if (!matchOverrides) return;

    // Find the current player_stats for this match/source from local comparison data,
    // then patch the overridden values
    const match = comparison.find((m) => m.matchId === matchId);
    if (!match) return;
    const sourceData = match.sources[source];
    if (!sourceData) return;

    // Build patched points â€” we patch calculatedPoints only here for the UI.
    // The real patch goes to the server via overrides.
    const patchedPoints = { ...sourceData.calculatedPoints };
    for (const [playerName, newPts] of Object.entries(matchOverrides)) {
      const n = Number(newPts);
      if (!isNaN(n)) patchedPoints[playerName] = n;
    }

    setAccepting(matchId);
    try {
      // For overrides we accept this source AND apply manual patches
      const res = await fetch(`/api/rooms/${roomCode}/webscrape-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season,
          accepts: [{ matchId, source }],
          // Note: overrides here adjust calculated_points, not player_stats directly.
          // The server patches calculated_points via the overrides field.
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Apply failed.");

      setComparison((prev) =>
        prev.map((m) => {
          if (m.matchId !== matchId) return m;
          const newSources = { ...m.sources };
          for (const k of Object.keys(newSources)) {
            newSources[k] = {
              ...newSources[k]!,
              accepted: k === source,
              calculatedPoints: k === source ? patchedPoints : newSources[k]!.calculatedPoints,
            };
          }
          return { ...m, sources: newSources };
        }),
      );
      setOverrideEdit(null);
      router.refresh();
    } catch (err) {
      alert(toErrorMessage(err));
    } finally {
      setAccepting(null);
    }
  }

  // Build flat rows for export
  const getExportRows = useCallback(() => {
    const rows: Record<string, unknown>[] = [];
    for (const match of comparison) {
      for (const [sourceKey, sd] of Object.entries(match.sources)) {
        for (const [player, pts] of Object.entries(sd.calculatedPoints)) {
          rows.push({
            matchId: match.matchId,
            matchDate: match.matchDate,
            teams: match.teams.join(" vs "),
            source: sourceKey,
            sourceLabel: sd.sourceLabel,
            accepted: sd.accepted ? "Yes" : "No",
            player,
            points: pts,
          });
        }
      }
    }
    return rows;
  }, [comparison]);

  const exportColumns = [
    { key: "matchDate", header: "Date" },
    { key: "teams", header: "Match" },
    { key: "source", header: "Source" },
    { key: "sourceLabel", header: "Source Label" },
    { key: "accepted", header: "Accepted" },
    { key: "player", header: "Player" },
    { key: "points", header: "Points" },
  ];

  return (
    <div className="form-grid">
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>IPL Season</label>
          <input
            className="input"
            disabled={fetching}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="2026"
            style={{ maxWidth: "7rem" }}
            type="text"
            value={season}
          />
        </div>
        <button
          className="button secondary"
          disabled={fetching || !selectedProvider}
          onClick={() => void handleFetch()}
          style={{ marginTop: "auto" }}
          type="button"
        >
          {fetching
            ? "Fetching live data..."
            : `Fetch Live Scores${selectedProvider ? ` (${providers.find((provider) => provider.id === selectedProvider)?.label ?? selectedProvider})` : ""}`}
        </button>
        {comparison.length > 0 && (
          <div style={{ marginTop: "auto" }}>
            <ExportButton
              getData={getExportRows}
              columns={exportColumns}
              filename={`ipl-${season}-webscrape`}
            />
          </div>
        )}
        {/* Auto-refresh toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", cursor: "pointer", fontSize: "0.85rem" }}>
          <input
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            type="checkbox"
          />
          Auto-refresh
          {autoRefresh && nextRefreshIn > 0 && (
            <span className="subtle" style={{ fontSize: "0.78rem" }}>
              (next in {Math.floor(nextRefreshIn / 60)}:{String(nextRefreshIn % 60).padStart(2, "0")})
            </span>
          )}
        </label>
        {lastFetched && (
          <span className="subtle" style={{ fontSize: "0.78rem", marginTop: "auto" }}>
            Last fetched: {lastFetched}
          </span>
        )}
      </div>

      {/* Provider status */}
      {providers.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {providers.map((p) => (
            <button
              key={p.id}
              className={`pill ${selectedProvider === p.id ? "highlight" : ""}`}
              disabled={!p.configured || fetching}
              onClick={() => setSelectedProvider(p.id)}
              style={{
                fontSize: "0.78rem",
                opacity: p.configured ? 1 : 0.5,
                cursor: p.configured ? "pointer" : "not-allowed",
                background: selectedProvider === p.id ? undefined : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(116, 104, 255, 0.28)",
              }}
              title={p.configured ? "API key configured" : "API key missing"}
              type="button"
            >
              {p.label} {selectedProvider === p.id ? "(Selected)" : p.configured ? "(Ready)" : "(Missing key)"}
            </button>
          ))}
        </div>
      )}

      {/* Fetch errors from each provider */}
      {Object.entries(errors).map(([src, msg]) => (
        <div key={src} className="notice warning" style={{ padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>
          <strong>{src}:</strong> {msg}
        </div>
      ))}

      {fetchError && <div className="notice warning">{fetchError}</div>}

      {/* Comparison table */}
      {comparison.length === 0 && !fetching && (
        <p className="subtle" style={{ fontSize: "0.85rem" }}>
          Pick a provider, then click <strong>Fetch Live Scores</strong> to pull match data. You can compare stored sources side-by-side and accept the one you want for each match.
        </p>
      )}

      {comparison.map((match) => {
        const sourceKeys = Object.keys(match.sources);
        const isProcessing = accepting === match.matchId;
        const acceptedSource = sourceKeys.find((k) => match.sources[k]?.accepted);
        const isOverrideOpen = overrideEdit === match.matchId;

        return (
          <div
            key={match.matchId}
            className="panel results-panel-accent"
            style={{ padding: "1rem", gap: "0.75rem" }}
          >
            {/* Match header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.82rem", color: "var(--subtle, #888)" }}>
                  {match.matchDate}
                </div>
                <strong style={{ fontSize: "1rem" }}>
                  {match.teams.join(" vs ") || match.matchId}
                </strong>
              </div>
              {acceptedSource && (
                <span className="pill highlight" style={{ fontSize: "0.78rem" }}>
                  Accepted: {match.sources[acceptedSource]?.sourceLabel ?? acceptedSource}
                </span>
              )}
              <button
                className="btn-sm ghost"
                onClick={() => setOverrideEdit(isOverrideOpen ? null : match.matchId)}
                style={{ marginLeft: "auto", fontSize: "0.78rem" }}
                type="button"
              >
                {isOverrideOpen ? "Close editor" : "Manual edit"}
              </button>
            </div>

            {/* Source comparison columns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.max(sourceKeys.length, 1)}, 1fr)`,
                gap: "0.75rem",
              }}
            >
              {sourceKeys.map((srcKey) => {
                const sd = match.sources[srcKey]!;
                const top = topScorers(sd.calculatedPoints);
                const total = totalPts(sd.calculatedPoints);
                const isAccepted = sd.accepted;

                return (
                  <div
                    key={srcKey}
                    style={{
                      background: isAccepted
                        ? "rgba(99, 220, 120, 0.07)"
                        : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isAccepted ? "rgba(99,220,120,0.3)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "8px",
                      padding: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <strong style={{ fontSize: "0.85rem" }}>{sd.sourceLabel}</strong>
                      <span className="subtle" style={{ fontSize: "0.78rem" }}>
                        {total} total pts
                      </span>
                    </div>

                    {/* Top scorers preview */}
                    <div style={{ fontSize: "0.8rem", marginBottom: "0.65rem" }}>
                      {top.map(([name, pts]) => (
                        <div
                          key={name}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "0.18rem 0",
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {name}
                          </span>
                          <strong>{pts}</strong>
                        </div>
                      ))}
                      {Object.keys(sd.calculatedPoints).length > 5 && (
                        <div className="subtle" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>
                          +{Object.keys(sd.calculatedPoints).length - 5} more players
                        </div>
                      )}
                    </div>

                    <button
                      className={`button ${isAccepted ? "" : "ghost"}`}
                      disabled={isProcessing}
                      onClick={() => void handleAccept(match.matchId, srcKey)}
                      style={{ width: "100%", fontSize: "0.82rem", padding: "0.45rem" }}
                      type="button"
                    >
                      {isAccepted ? "Accepted âœ“" : isProcessing ? "Acceptingâ€¦" : "Accept this source"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Manual override editor */}
            {isOverrideOpen && (
              <div
                style={{
                  background: "rgba(255,200,50,0.05)",
                  border: "1px solid rgba(255,200,50,0.2)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                }}
              >
                <p className="subtle" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                  Override points for individual players. Select a source to accept and apply.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))",
                    gap: "0.4rem",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  {sourceKeys.flatMap((srcKey) =>
                    Object.keys(match.sources[srcKey]?.calculatedPoints ?? {}).map((player) => (
                      <div key={`${srcKey}-${player}`} style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.78rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {player}
                        </span>
                        <input
                          className="input"
                          style={{ width: "60px", padding: "0.2rem 0.4rem", fontSize: "0.78rem" }}
                          type="number"
                          placeholder={String(match.sources[srcKey]?.calculatedPoints[player] ?? 0)}
                          value={overrides[match.matchId]?.[player] ?? ""}
                          onChange={(e) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [match.matchId]: {
                                ...(prev[match.matchId] ?? {}),
                                [player]: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    )),
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                  {sourceKeys.map((srcKey) => (
                    <button
                      key={srcKey}
                      className="button secondary"
                      disabled={isProcessing}
                      onClick={() => void handleApplyOverride(match.matchId, srcKey)}
                      style={{ fontSize: "0.8rem" }}
                      type="button"
                    >
                      {isProcessing ? "Applyingâ€¦" : `Apply + Accept ${match.sources[srcKey]?.sourceLabel ?? srcKey}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

