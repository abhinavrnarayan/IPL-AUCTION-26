"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toErrorMessage } from "@/lib/utils";
import { auctionPhaseLabel } from "@/lib/domain/types";
import { AdminPlayersForm } from "@/components/admin/admin-players-form";
import { UploadTeamsForm } from "@/components/room/upload-teams-form";
import { DrawerSection } from "@/components/room/drawer-section";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchSource {
  sourceLabel: string;
  calculatedPoints: Record<string, number>;
  accepted: boolean;
  pushedAt: string | null;
}

interface MatchComparison {
  matchId: string;
  matchDate: string;
  teams: string[];
  sources: Record<string, MatchSource>;
}

interface RoomRow {
  id: string;
  code: string;
  name: string;
  players: number;
  teams: number;
  members: number;
  auctionPhase: string;
  lastSync: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  role: string;
  status: string;
  stats: Record<string, unknown> | null;
  // enriched fields (returned by GET /api/admin/player-stats)
  iplTeam?: string | null;
  totalPoints?: number;
  basePrice?: number;
  soldPrice?: number | null;
  currentTeamId?: string | null;
  currentTeamName?: string | null;
}

const STAT_GROUPS: Array<{ label: string; fields: Array<{ key: string; label: string }> }> = [
  {
    label: "Batting",
    fields: [
      { key: "runs", label: "Runs" },
      { key: "balls_faced", label: "Balls faced" },
      { key: "fours", label: "Fours" },
      { key: "sixes", label: "Sixes" },
      { key: "ducks", label: "Ducks" },
    ],
  },
  {
    label: "Bowling",
    fields: [
      { key: "wickets", label: "Wickets" },
      { key: "balls_bowled", label: "Balls bowled" },
      { key: "runs_conceded", label: "Runs conceded" },
      { key: "maiden_overs", label: "Maiden overs" },
      { key: "lbw_bowled_wickets", label: "LBW/Bowled wkts" },
    ],
  },
  {
    label: "Fielding",
    fields: [
      { key: "catches", label: "Catches" },
      { key: "stumpings", label: "Stumpings" },
      { key: "run_outs_direct", label: "Run-outs (direct)" },
      { key: "run_outs_indirect", label: "Run-outs (indirect)" },
    ],
  },
  {
    label: "Bonus pts (pre-computed per match)",
    fields: [
      { key: "dot_ball_pts", label: "Dot ball pts" },
      { key: "milestone_runs_pts", label: "Milestone runs pts" },
      { key: "milestone_wkts_pts", label: "Milestone wkts pts" },
      { key: "sr_pts", label: "Strike rate pts" },
      { key: "economy_pts", label: "Economy pts" },
      { key: "catch_bonus_pts", label: "Catch bonus pts" },
    ],
  },
  {
    label: "Appearances",
    fields: [
      { key: "lineup_appearances", label: "Lineup appearances" },
      { key: "matches_played", label: "Matches played" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalPts(pts: Record<string, number>): number {
  return Object.values(pts).reduce((s, v) => s + v, 0);
}

function topScorers(pts: Record<string, number>, n = 5): Array<[string, number]> {
  return Object.entries(pts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ── Tab: Score Sync ───────────────────────────────────────────────────────────

function ScoreSyncTab() {
  const [season, setSeason] = useState("2026");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; label: string; configured: boolean }>>([]);
  const [fetching, setFetching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [comparison, setComparison] = useState<MatchComparison[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [fileRef, setFileRef] = useState<HTMLInputElement | null>(null);
  const [syncMode, setSyncMode] = useState<"fetch" | "upload" | "json">("fetch");

  // Load stored comparison on mount / season change
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/live-sync?season=${season}`);
        const data = (await res.json()) as { ok: boolean; comparison?: MatchComparison[]; providers?: typeof providers };
        if (data.ok) {
          setComparison(data.comparison ?? []);
          setProviders(data.providers ?? []);
        }
      } catch { /* ignore */ }
    }
    void load();
  }, [season]);

  useEffect(() => {
    if (!selectedProvider) {
      const first = providers.find((p) => p.configured);
      if (first) setSelectedProvider(first.id);
    }
  }, [providers, selectedProvider]);

  const handleCricsheetSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    setFetchError(null);
    try {
      let response: Response;
      if (syncMode === "upload" || syncMode === "json") {
        const file = fileRef?.files?.[0];
        if (!file) { setFetchError("Select a file first."); setSyncing(false); return; }
        const form = new FormData();
        form.append("file", file);
        form.append("season", season);
        response = await fetch("/api/admin/cricsheet-sync", { method: "POST", body: form });
      } else {
        response = await fetch("/api/admin/cricsheet-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season }),
        });
      }
      const data = (await response.json()) as { ok: boolean; error?: string; matchesProcessed?: number; matchesUpserted?: number; matchesAlreadyAccepted?: number };
      if (!response.ok || !data.ok) { setFetchError(data.error ?? "Sync failed."); return; }
      setSyncResult(`Done. ${data.matchesUpserted ?? 0} new matches stored. ${data.matchesAlreadyAccepted ?? 0} already accepted.`);
    } catch (err) {
      setFetchError(toErrorMessage(err));
    } finally {
      setSyncing(false);
    }
  }, [season, syncMode, fileRef]);

  const handleLiveFetch = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, provider: selectedProvider }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; comparison?: MatchComparison[]; providers?: typeof providers; matchesFetched?: number };
      if (!res.ok || !data.ok) { setFetchError(data.error ?? "Fetch failed."); if (data.providers) setProviders(data.providers); return; }
      setComparison(data.comparison ?? []);
      if (data.providers) setProviders(data.providers);
    } catch (err) {
      setFetchError(toErrorMessage(err));
    } finally {
      setFetching(false);
    }
  }, [season, selectedProvider]);

  async function handleAccept(matchId: string, source: string) {
    setAccepting(matchId);
    try {
      const res = await fetch("/api/admin/accept-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, source }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; roomsUpdated?: number; playersUpdated?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Accept failed.");
      // Optimistically mark accepted in local state
      setComparison((prev) =>
        prev.map((m) => {
          if (m.matchId !== matchId) return m;
          const newSources = Object.fromEntries(
            Object.entries(m.sources).map(([k, v]) => [k, { ...v, accepted: k === source }]),
          );
          return { ...m, sources: newSources };
        }),
      );
      setSyncResult(`Match accepted. ${data.roomsUpdated} rooms updated, ${data.playersUpdated} players updated.`);
    } catch (err) {
      alert(toErrorMessage(err));
    } finally {
      setAccepting(null);
    }
  }

  async function handleAcceptSeason() {
    setAcceptingAll(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/accept-season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; accepted?: number; pushed?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Bulk accept failed.");
      setSyncResult(`Season accepted: ${data.accepted} matches accepted, ${data.pushed} pushed to all rooms.`);
      // Reload comparison
      const reload = await fetch(`/api/admin/live-sync?season=${season}`);
      const reloadData = (await reload.json()) as { ok: boolean; comparison?: MatchComparison[] };
      if (reloadData.ok) setComparison(reloadData.comparison ?? []);
    } catch (err) {
      alert(toErrorMessage(err));
    } finally {
      setAcceptingAll(false);
    }
  }

  const pendingCount = comparison.reduce((count, m) => {
    const hasAccepted = Object.values(m.sources).some((s) => s.accepted);
    return hasAccepted ? count : count + 1;
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Cricsheet Sync */}
      <div className="panel" style={{ borderColor: "rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.03)" }}>
        <span className="eyebrow">Ball-by-ball data</span>
        <h2 style={{ marginTop: "0.4rem", marginBottom: "1rem" }}>Cricsheet Sync</h2>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Season</label>
            <input
              className="input"
              style={{ maxWidth: "7rem" }}
              type="text"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              disabled={syncing}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {(["fetch", "upload", "json"] as const).map((m) => (
              <button key={m} className={`button ${syncMode === m ? "" : "ghost"}`} onClick={() => setSyncMode(m)} disabled={syncing} type="button">
                {m === "fetch" ? "Auto-fetch" : m === "upload" ? "Upload ZIP" : "Upload JSON"}
              </button>
            ))}
          </div>
        </div>

        {(syncMode === "upload" || syncMode === "json") && (
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label>{syncMode === "json" ? "Single match JSON" : "Full season ZIP"}</label>
            <input
              className="input"
              type="file"
              accept={syncMode === "json" ? ".json" : ".zip"}
              ref={(el) => setFileRef(el)}
              disabled={syncing}
            />
          </div>
        )}

        {syncResult && <div className="notice success" style={{ marginBottom: "0.75rem" }}>{syncResult}</div>}
        {fetchError && <div className="notice warning" style={{ marginBottom: "0.75rem" }}>{fetchError}</div>}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="button secondary" onClick={() => void handleCricsheetSync()} disabled={syncing} type="button">
            {syncing ? "Syncing..." : "Sync Cricsheet data"}
          </button>
          {pendingCount > 0 && (
            <button className="button" onClick={() => void handleAcceptSeason()} disabled={acceptingAll} type="button">
              {acceptingAll ? "Pushing..." : `Accept all pending (${pendingCount} matches) → all rooms`}
            </button>
          )}
        </div>
      </div>

      {/* Live Web Sync */}
      <div className="panel" style={{ borderColor: "rgba(99,220,120,0.2)", background: "rgba(99,220,120,0.03)" }}>
        <span className="eyebrow">API data</span>
        <h2 style={{ marginTop: "0.4rem", marginBottom: "1rem" }}>Live Web Sync</h2>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
          {providers.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {providers.map((p) => (
                <button
                  key={p.id}
                  className={`pill ${selectedProvider === p.id ? "highlight" : ""}`}
                  disabled={!p.configured || fetching}
                  onClick={() => setSelectedProvider(p.id)}
                  type="button"
                  style={{ fontSize: "0.78rem", opacity: p.configured ? 1 : 0.5, cursor: p.configured ? "pointer" : "not-allowed" }}
                  title={p.configured ? "API key configured" : "API key missing"}
                >
                  {p.label} {selectedProvider === p.id ? "(Selected)" : p.configured ? "(Ready)" : "(No key)"}
                </button>
              ))}
            </div>
          )}
          <button className="button secondary" onClick={() => void handleLiveFetch()} disabled={fetching || !selectedProvider} type="button" style={{ marginTop: "auto" }}>
            {fetching ? "Fetching..." : `Fetch Live Scores${selectedProvider ? ` (${providers.find((p) => p.id === selectedProvider)?.label ?? selectedProvider})` : ""}`}
          </button>
        </div>
      </div>

      {/* Pending Matches */}
      {comparison.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 style={{ margin: 0 }}>
              Matches ({comparison.length})
              {pendingCount > 0 && <span className="pill" style={{ marginLeft: "0.5rem", fontSize: "0.78rem" }}>{pendingCount} pending</span>}
            </h2>
          </div>

          {comparison.map((match) => {
            const sourceKeys = Object.keys(match.sources);
            const acceptedSource = sourceKeys.find((k) => match.sources[k]?.accepted);
            const isProcessing = accepting === match.matchId;

            return (
              <div key={match.matchId} className="panel results-panel-accent" style={{ padding: "1rem", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <div>
                    <div style={{ fontSize: "0.78rem", color: "var(--subtle, #888)" }}>{match.matchDate}</div>
                    <strong>{match.teams.join(" vs ") || match.matchId}</strong>
                  </div>
                  {acceptedSource && (
                    <span className="pill highlight" style={{ fontSize: "0.78rem" }}>
                      Accepted: {match.sources[acceptedSource]?.sourceLabel ?? acceptedSource}
                      {match.sources[acceptedSource]?.pushedAt && " · pushed"}
                    </span>
                  )}
                </div>

                <div className="source-comparison-grid" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(sourceKeys.length, 1)}, 1fr)`, gap: "0.75rem" }}>
                  {sourceKeys.map((srcKey) => {
                    const sd = match.sources[srcKey]!;
                    const top = topScorers(sd.calculatedPoints);
                    const total = totalPts(sd.calculatedPoints);

                    return (
                      <div
                        key={srcKey}
                        style={{
                          background: sd.accepted ? "rgba(99,220,120,0.07)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${sd.accepted ? "rgba(99,220,120,0.3)" : "rgba(255,255,255,0.08)"}`,
                          borderRadius: "8px",
                          padding: "0.75rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                          <strong style={{ fontSize: "0.85rem" }}>{sd.sourceLabel}</strong>
                          <span className="subtle" style={{ fontSize: "0.78rem" }}>{total} pts total</span>
                        </div>
                        <div style={{ fontSize: "0.8rem", marginBottom: "0.65rem" }}>
                          {top.map(([name, pts]) => (
                            <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "0.18rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{name}</span>
                              <strong>{pts}</strong>
                            </div>
                          ))}
                          {Object.keys(sd.calculatedPoints).length > 5 && (
                            <div className="subtle" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>+{Object.keys(sd.calculatedPoints).length - 5} more</div>
                          )}
                        </div>
                        <button
                          className={`button ${sd.accepted ? "" : "ghost"}`}
                          disabled={isProcessing || sd.accepted}
                          onClick={() => void handleAccept(match.matchId, srcKey)}
                          style={{ width: "100%", fontSize: "0.82rem", padding: "0.45rem" }}
                          type="button"
                        >
                          {sd.accepted ? "Accepted" : isProcessing ? "Pushing to all rooms..." : "Accept + Push to all rooms"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Points Management */}
      <PointsManagementPanel />
    </div>
  );
}

// ── Points Management (used inside ScoreSyncTab) ──────────────────────────────

function PointsManagementPanel() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>("all");
  const [resetting, setResetting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[] };
        if (data.ok) setRooms(data.rooms ?? []);
      } catch { /* ignore */ } finally {
        setLoadingRooms(false);
      }
    }
    void load();
  }, []);

  const scope = selectedRoomCode === "all" ? null : selectedRoomCode;
  const scopeLabel =
    selectedRoomCode === "all"
      ? "all rooms"
      : (rooms.find((r) => r.code === selectedRoomCode)?.name ?? selectedRoomCode);

  async function handleReset() {
    setResetting(true);
    setConfirmReset(false);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope ? { roomCode: scope } : {}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        roomsReset?: number;
        playersReset?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
      setMessage(`Reset ${data.playersReset ?? 0} players across ${data.roomsReset ?? 0} rooms.`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setResetting(false);
    }
  }

  async function handleRecalculate() {
    setRecalculating(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/recalculate-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope ? { roomCode: scope } : {}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        roomsRecalculated?: number;
        playersUpdated?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Recalculate failed.");
      setMessage(
        `Recalculated ${data.playersUpdated ?? 0} players across ${data.roomsRecalculated ?? 0} rooms.`,
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRecalculating(false);
    }
  }

  const busy = resetting || recalculating;

  return (
    <div
      className="panel"
      style={{ borderColor: "rgba(251,191,36,0.18)", background: "rgba(251,191,36,0.03)" }}
    >
      <span className="eyebrow">Maintenance</span>
      <h2 style={{ marginTop: "0.4rem", marginBottom: "0.5rem" }}>Points Management</h2>
      <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
        <strong>Reset points</strong> zeroes player stats but keeps match data — follow with Update Points to rebuild.
        <br />
        <strong>Update points</strong> rebuilds from all accepted match results.
      </p>

      <div className="field" style={{ marginBottom: "1rem", maxWidth: "320px" }}>
        <label>Scope</label>
        <select
          className="select"
          value={selectedRoomCode}
          onChange={(e) => {
            setSelectedRoomCode(e.target.value);
            setMessage(null);
            setError(null);
          }}
          disabled={loadingRooms || busy}
        >
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className="notice success" style={{ marginBottom: "0.75rem" }}>{message}</div>
      )}
      {error && (
        <div className="notice warning" style={{ marginBottom: "0.75rem" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        {confirmReset ? (
          <>
            <span className="subtle" style={{ fontSize: "0.82rem" }}>
              Zero all points for {scopeLabel}?
            </span>
            <button
              className="button"
              onClick={() => void handleReset()}
              disabled={busy}
              type="button"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.8rem" }}
            >
              {resetting ? "Resetting…" : "Confirm reset"}
            </button>
            <button
              className="button ghost"
              onClick={() => setConfirmReset(false)}
              type="button"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.8rem" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="button ghost"
            style={{ color: "var(--error, #f87171)" }}
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            type="button"
          >
            Reset points — {scopeLabel}
          </button>
        )}

        <button
          className="button secondary"
          onClick={() => void handleRecalculate()}
          disabled={busy}
          type="button"
        >
          {recalculating ? "Recalculating…" : `Update points — ${scopeLabel}`}
        </button>
      </div>

    </div>
  );
}

// ── Tab: Rooms Overview ───────────────────────────────────────────────────────

function RoomsTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[]; error?: string };
        if (!res.ok || !data.ok) { setError(data.error ?? "Failed to load rooms."); return; }
        setRooms(data.rooms ?? []);
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <p className="subtle">Loading rooms…</p>;
  if (error) return <div className="notice warning">{error}</div>;
  if (rooms.length === 0) return <p className="subtle">No rooms found.</p>;

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", minWidth: "600px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {["Code", "Name", "Teams", "Players", "Members", "Phase", "Last Sync", ""].map((h) => (
              <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "var(--subtle, #888)", fontWeight: 600, fontSize: "0.78rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <td style={{ padding: "0.7rem 1rem" }}><code style={{ fontSize: "0.82rem" }}>{room.code}</code></td>
              <td style={{ padding: "0.7rem 1rem" }}>{room.name}</td>
              <td style={{ padding: "0.7rem 1rem" }}>{room.teams}</td>
              <td style={{ padding: "0.7rem 1rem" }}>{room.players}</td>
              <td style={{ padding: "0.7rem 1rem" }}>{room.members}</td>
              <td style={{ padding: "0.7rem 1rem" }}>
                <span className={`pill ${room.auctionPhase === "LIVE" ? "highlight" : ""}`} style={{ fontSize: "0.75rem" }}>{auctionPhaseLabel(room.auctionPhase)}</span>
              </td>
              <td style={{ padding: "0.7rem 1rem", color: "var(--subtle, #888)", fontSize: "0.8rem" }}>
                {room.lastSync ? new Date(room.lastSync).toLocaleDateString() : "Never"}
              </td>
              <td style={{ padding: "0.7rem 1rem" }}>
                <a href={`/room/${room.code}`} target="_blank" rel="noopener noreferrer" className="button ghost" style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}>
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Tab: Players & Teams ─────────────────────────────────────────────────────

function PlayersTeamsTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[] };
        if (data.ok && data.rooms) {
          setRooms(data.rooms);
          if (data.rooms.length > 0) setSelectedRoomCode(data.rooms[0].code);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <p className="subtle">Loading rooms…</p>;
  if (rooms.length === 0) return <p className="subtle">No rooms found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Global player pool — pushes to all rooms */}
      <div className="panel" style={{ borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.03)" }}>
        <span className="eyebrow">Global — affects every room</span>
        <h2 style={{ marginTop: "0.4rem", marginBottom: "0.5rem" }}>Player Pool</h2>
        <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
          The player list is shared across all rooms. Uploading here pushes to every room simultaneously.
          Room admins cannot modify this list.
        </p>
        <AdminPlayersForm />
      </div>

      {/* Per-room team upload */}
      <div className="panel" style={{ borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.03)" }}>
        <span className="eyebrow">Per-room</span>
        <h2 style={{ marginTop: "0.4rem", marginBottom: "1rem" }}>Team Upload</h2>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label>Room</label>
          <select
            className="select"
            value={selectedRoomCode}
            onChange={(e) => setSelectedRoomCode(e.target.value)}
          >
            {rooms.map((room) => (
              <option key={room.code} value={room.code}>
                {room.name} ({room.code})
              </option>
            ))}
          </select>
        </div>
        {selectedRoomCode && <UploadTeamsForm roomCode={selectedRoomCode} />}
      </div>
    </div>
  );
}

// ── Tab: Players & Points ─────────────────────────────────────────────────────

type SortKey = "name" | "iplTeam" | "role" | "status" | "currentTeamName" | "totalPoints";

function PlayersPointsTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalPoints");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[] };
        if (data.ok && data.rooms?.length) {
          setRooms(data.rooms);
          setSelectedRoomCode(data.rooms[0]!.code);
        }
      } catch { /* ignore */ } finally {
        setLoadingRooms(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!selectedRoomCode) return;
    setLoadingPlayers(true);
    setPlayers([]);
    async function load() {
      try {
        const res = await fetch(`/api/admin/player-stats?roomCode=${selectedRoomCode}`);
        const data = (await res.json()) as { ok: boolean; players?: PlayerRow[] };
        if (data.ok) setPlayers(data.players ?? []);
      } catch { /* ignore */ } finally {
        setLoadingPlayers(false);
      }
    }
    void load();
  }, [selectedRoomCode]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key !== "totalPoints"); // points default desc, others asc
    }
  }

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.iplTeam ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "totalPoints") {
      cmp = (a.totalPoints ?? 0) - (b.totalPoints ?? 0);
    } else if (sortKey === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === "iplTeam") {
      cmp = (a.iplTeam ?? "").localeCompare(b.iplTeam ?? "");
    } else if (sortKey === "role") {
      cmp = a.role.localeCompare(b.role);
    } else if (sortKey === "status") {
      cmp = a.status.localeCompare(b.status);
    } else if (sortKey === "currentTeamName") {
      cmp = (a.currentTeamName ?? "").localeCompare(b.currentTeamName ?? "");
    }
    return sortAsc ? cmp : -cmp;
  });

  const statusColor: Record<string, string> = {
    SOLD: "rgba(99,220,120,0.18)",
    UNSOLD: "rgba(244,63,94,0.14)",
    AVAILABLE: "rgba(99,102,241,0.14)",
  };
  const statusText: Record<string, string> = {
    SOLD: "#4ade80",
    UNSOLD: "#f87171",
    AVAILABLE: "#a5b4fc",
  };

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th
        style={{
          padding: "0.65rem 0.9rem",
          textAlign: col === "totalPoints" ? "right" : "left",
          color: active ? "var(--accent, #7468ff)" : "var(--subtle, #888)",
          fontWeight: 600,
          fontSize: "0.75rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        onClick={() => handleSort(col)}
      >
        {label}{active ? (sortAsc ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (loadingRooms) return <p className="subtle">Loading rooms…</p>;
  if (rooms.length === 0) return <p className="subtle">No rooms found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, minWidth: "200px" }}>
          <label>Room</label>
          <select
            className="select"
            value={selectedRoomCode}
            onChange={(e) => setSelectedRoomCode(e.target.value)}
            disabled={loadingPlayers}
          >
            {rooms.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: "200px" }}>
          <label>Search player or IPL team</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Kohli, RCB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!loadingPlayers && players.length > 0 && (
          <div className="subtle" style={{ fontSize: "0.82rem", paddingBottom: "0.45rem" }}>
            {sorted.length} / {players.length} players
          </div>
        )}
      </div>

      {/* Table */}
      {loadingPlayers ? (
        <p className="subtle">Loading players…</p>
      ) : sorted.length === 0 ? (
        <p className="subtle">{players.length === 0 ? "No players in this room." : "No matches."}</p>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={{ padding: "0.65rem 0.9rem", textAlign: "left", color: "var(--subtle, #888)", fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>#</th>
                  <SortTh label="Player" col="name" />
                  <SortTh label="IPL Team" col="iplTeam" />
                  <SortTh label="Role" col="role" />
                  <SortTh label="Status" col="status" />
                  <SortTh label="Fantasy Team" col="currentTeamName" />
                  <SortTh label="Pts" col="totalPoints" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((player, idx) => (
                  <tr
                    key={player.id}
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    }}
                  >
                    <td style={{ padding: "0.6rem 0.9rem", color: "var(--subtle, #888)", fontSize: "0.78rem" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", fontWeight: 600 }}>
                      {player.name}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>
                      {player.iplTeam ? (
                        <span
                          className="pill"
                          style={{
                            fontSize: "0.75rem",
                            background: "rgba(99,102,241,0.12)",
                            color: "var(--accent, #a5b4fc)",
                            border: "1px solid rgba(99,102,241,0.22)",
                          }}
                        >
                          {player.iplTeam}
                        </span>
                      ) : (
                        <span className="subtle" style={{ fontSize: "0.78rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", color: "var(--subtle, #888)", textTransform: "capitalize" }}>
                      {player.role}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>
                      <span
                        className="pill"
                        style={{
                          fontSize: "0.75rem",
                          background: statusColor[player.status] ?? "rgba(255,255,255,0.06)",
                          color: statusText[player.status] ?? "var(--subtle, #888)",
                        }}
                      >
                        {player.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>
                      {player.currentTeamName ? (
                        <span style={{ fontWeight: 500 }}>{player.currentTeamName}</span>
                      ) : (
                        <span className="subtle" style={{ fontSize: "0.78rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", textAlign: "right" }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display), sans-serif",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                          color: (player.totalPoints ?? 0) > 0 ? "var(--accent, #a5b4fc)" : "var(--subtle, #888)",
                        }}
                      >
                        {player.totalPoints ?? 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Score Correction ─────────────────────────────────────────────────────

function ScoreCorrectionTab() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoomCode, setSelectedRoomCode] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [editedStats, setEditedStats] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load rooms once
  useEffect(() => {
    async function loadRooms() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[] };
        if (data.ok && data.rooms?.length) {
          setRooms(data.rooms);
          setSelectedRoomCode(data.rooms[0]!.code);
        }
      } catch { /* ignore */ } finally {
        setLoadingRooms(false);
      }
    }
    void loadRooms();
  }, []);

  // Load players when room changes
  useEffect(() => {
    if (!selectedRoomCode) return;
    setLoadingPlayers(true);
    setPlayers([]);
    setSelectedPlayerId("");
    setEditedStats({});
    setMessage(null);
    setError(null);
    async function loadPlayers() {
      try {
        const res = await fetch(`/api/admin/player-stats?roomCode=${selectedRoomCode}`);
        const data = (await res.json()) as { ok: boolean; players?: PlayerRow[] };
        if (data.ok) setPlayers(data.players ?? []);
      } catch { /* ignore */ } finally {
        setLoadingPlayers(false);
      }
    }
    void loadPlayers();
  }, [selectedRoomCode]);

  // Populate form when player changes
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  useEffect(() => {
    if (!selectedPlayer) { setEditedStats({}); return; }
    const stats = selectedPlayer.stats ?? {};
    const initial: Record<string, string> = {};
    for (const group of STAT_GROUPS) {
      for (const field of group.fields) {
        const val = stats[field.key];
        initial[field.key] = val !== undefined && val !== null ? String(val) : "0";
      }
    }
    setEditedStats(initial);
    setMessage(null);
    setError(null);
  }, [selectedPlayerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!selectedPlayerId || !selectedRoomCode || !selectedPlayer) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      // Preserve meta fields (ipl_team, cricsheet_name, etc.) and overwrite scoring fields
      const merged = { ...(selectedPlayer.stats ?? {}) };
      for (const group of STAT_GROUPS) {
        for (const field of group.fields) {
          const n = parseFloat(editedStats[field.key] ?? "0");
          merged[field.key] = Number.isFinite(n) ? n : 0;
        }
      }
      const res = await fetch("/api/admin/player-stats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: selectedRoomCode, playerId: selectedPlayerId, stats: merged }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      setMessage("Stats saved.");
      setPlayers((prev) =>
        prev.map((p) => (p.id === selectedPlayerId ? { ...p, stats: merged } : p)),
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadingRooms) return <p className="subtle">Loading rooms…</p>;
  if (rooms.length === 0) return <p className="subtle">No rooms found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Selectors */}
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Select Player</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: "180px", marginBottom: 0 }}>
            <label>Room</label>
            <select
              className="select"
              value={selectedRoomCode}
              onChange={(e) => setSelectedRoomCode(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 2, minWidth: "220px", marginBottom: 0 }}>
            <label>
              Player {loadingPlayers ? "(loading…)" : `(${players.length} in room)`}
            </label>
            <select
              className="select"
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              disabled={loadingPlayers || players.length === 0}
            >
              <option value="">— Select player —</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role}){p.status === "SOLD" ? " · sold" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats editor */}
      {selectedPlayer && (
        <div className="panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>{selectedPlayer.name}</h2>
              <div className="subtle" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                {selectedPlayer.role} · {selectedPlayer.status}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
              {message && (
                <span style={{ fontSize: "0.82rem", color: "var(--success, #4ade80)" }}>{message}</span>
              )}
              {error && (
                <span style={{ fontSize: "0.82rem", color: "var(--error, #f87171)" }}>{error}</span>
              )}
              <button
                className="button"
                onClick={() => void handleSave()}
                disabled={saving}
                type="button"
              >
                {saving ? "Saving…" : "Save corrections"}
              </button>
            </div>
          </div>

          {STAT_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: "1.25rem" }}>
              <div className="eyebrow" style={{ marginBottom: "0.65rem" }}>{group.label}</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {group.fields.map((field) => (
                  <div className="field" key={field.key} style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: "0.78rem" }}>{field.label}</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="any"
                      value={editedStats[field.key] ?? "0"}
                      onChange={(e) =>
                        setEditedStats((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      disabled={saving}
                      style={{ fontSize: "0.88rem" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Superadmin Management ────────────────────────────────────────────────

function SuperadminTab() {
  const [superadmins, setSuperadmins] = useState<Array<{ id: string; email: string | null; display_name: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [grantEmail, setGrantEmail] = useState("");
  const [revokeEmail, setRevokeEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadAdmins() {
    try {
      const res = await fetch("/api/admin/superadmin");
      const data = (await res.json()) as { ok: boolean; superadmins?: typeof superadmins };
      if (data.ok && data.superadmins) setSuperadmins(data.superadmins);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAdmins(); }, []);

  async function handleGrant() {
    if (!grantEmail.trim()) return;
    setGranting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim(), grant: true }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      setMessage(data.message ?? "Access granted.");
      setGrantEmail("");
      void loadAdmins();
    } catch (err) {
      setMessage(toErrorMessage(err));
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke() {
    const target = revokeEmail.trim();
    if (!target) return;
    const confirmed = typeof window !== "undefined"
      ? window.confirm(`Revoke superadmin access from ${target}? They will immediately lose access to /admin and all superadmin APIs.`)
      : true;
    if (!confirmed) return;
    setRevoking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target, grant: false }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      setMessage(data.message ?? "Access revoked.");
      setRevokeEmail("");
      void loadAdmins();
    } catch (err) {
      setMessage(toErrorMessage(err));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Current superadmins list */}
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Current Superadmins</h2>
        {loading ? (
          <p className="subtle">Loading…</p>
        ) : superadmins.length === 0 ? (
          <p className="subtle">No superadmins found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
            {superadmins.map((sa) => (
              <div key={sa.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.85rem", borderRadius: "10px", background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.14)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{sa.display_name ?? "—"}</div>
                  <div className="subtle" style={{ fontSize: "0.8rem" }}>{sa.email ?? "—"}</div>
                </div>
                <span className="pill highlight" style={{ fontSize: "0.72rem" }}>Superadmin</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grant */}
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Grant Superadmin Access</h2>
        <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
          The user must already have an account.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: "220px", marginBottom: 0 }}>
            <label>Email address</label>
            <input
              className="input"
              type="email"
              placeholder="user@example.com"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              disabled={granting}
            />
          </div>
          <button className="button" onClick={() => void handleGrant()} disabled={granting || !grantEmail.trim()} type="button" style={{ marginTop: "auto" }}>
            {granting ? "Granting…" : "Grant access"}
          </button>
        </div>
        {message && <div className={`notice ${message.toLowerCase().includes("error") || message.toLowerCase().includes("fail") ? "warning" : "success"}`} style={{ marginTop: "0.75rem" }}>{message}</div>}
      </div>

      {/* Revoke */}
      <div className="panel" style={{ borderColor: "rgba(244,63,94,0.2)", background: "rgba(244,63,94,0.03)" }}>
        <h2 style={{ marginTop: 0 }}>Revoke Superadmin Access</h2>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: "220px", marginBottom: 0 }}>
            <label>Email address</label>
            <input
              className="input"
              type="email"
              placeholder="user@example.com"
              value={revokeEmail}
              onChange={(e) => setRevokeEmail(e.target.value)}
              disabled={revoking}
            />
          </div>
          <button className="button danger" onClick={() => void handleRevoke()} disabled={revoking || !revokeEmail.trim()} type="button" style={{ marginTop: "auto" }}>
            {revoking ? "Revoking…" : "Revoke access"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────

// ── Danger Zone panel (used inside SettingsTab) ───────────────────────────────

function DangerZonePanel() {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>("all");
  const [dbResetting, setDbResetting] = useState(false);
  const [confirmDbReset, setConfirmDbReset] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/rooms");
        const data = (await res.json()) as { ok: boolean; rooms?: RoomRow[] };
        if (data.ok) setRooms(data.rooms ?? []);
      } catch { /* ignore */ } finally {
        setLoadingRooms(false);
      }
    }
    void load();
  }, []);

  const scope = selectedRoomCode === "all" ? null : selectedRoomCode;
  const scopeLabel =
    selectedRoomCode === "all"
      ? "all rooms"
      : (rooms.find((r) => r.code === selectedRoomCode)?.name ?? selectedRoomCode);

  async function handleDbReset() {
    setDbResetting(true);
    setConfirmDbReset(false);
    setConfirmText("");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/db-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope ? { roomCode: scope } : {}),
      });
      const data = (await res.json()) as {
        ok: boolean; error?: string;
        roomsReset?: number; playersReset?: number; matchRowsDeleted?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "DB reset failed.");
      setMessage(
        `Done: ${data.playersReset ?? 0} players zeroed, ${data.matchRowsDeleted ?? 0} match rows deleted across ${data.roomsReset ?? 0} rooms.`,
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setDbResetting(false);
    }
  }

  return (
    <div
      className="panel"
      style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.04)" }}
    >
      <span className="eyebrow" style={{ color: "var(--error, #f87171)" }}>Danger Zone</span>
      <h2 style={{ marginTop: "0.4rem", marginBottom: "0.5rem" }}>Full DB Reset</h2>
      <p className="subtle" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
        Zeroes all player stats AND deletes all match rows for the selected scope.
        Requires a fresh sync afterwards.{" "}
        <strong style={{ color: "var(--error, #f87171)" }}>Cannot be undone.</strong>
      </p>

      <div className="field" style={{ marginBottom: "1rem", maxWidth: "320px" }}>
        <label>Scope</label>
        <select
          className="select"
          value={selectedRoomCode}
          onChange={(e) => { setSelectedRoomCode(e.target.value); setMessage(null); setError(null); }}
          disabled={loadingRooms || dbResetting}
        >
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
          ))}
        </select>
      </div>

      {message && <div className="notice success" style={{ marginBottom: "0.75rem" }}>{message}</div>}
      {error   && <div className="notice warning" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      {confirmDbReset ? (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <span className="subtle" style={{ fontSize: "0.82rem" }}>
            Delete ALL match data for <strong>{scopeLabel}</strong>? This cannot be undone.
            Type <code style={{ padding: "0.1rem 0.35rem", borderRadius: "4px", background: "rgba(239,68,68,0.1)" }}>RESET</code> to confirm.
          </span>
          <input
            className="input"
            type="text"
            placeholder="Type RESET to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={dbResetting}
            autoFocus
            style={{ maxWidth: "280px", fontSize: "0.85rem" }}
          />
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              className="button danger"
              onClick={() => void handleDbReset()}
              disabled={dbResetting || confirmText.trim() !== "RESET"}
              type="button"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.8rem" }}
            >
              {dbResetting ? "Wiping…" : "Confirm full DB reset"}
            </button>
            <button
              className="button ghost"
              onClick={() => { setConfirmDbReset(false); setConfirmText(""); }}
              type="button"
              style={{ fontSize: "0.82rem", padding: "0.35rem 0.8rem" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="button danger"
          onClick={() => setConfirmDbReset(true)}
          disabled={dbResetting}
          type="button"
        >
          Full DB reset — {scopeLabel}
        </button>
      )}
    </div>
  );
}

function SettingsTab() {
  const [flags, setFlags] = useState<{ user_score_fetch: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        const data = (await res.json()) as { ok: boolean; flags?: { user_score_fetch: boolean } };
        if (data.ok && data.flags) setFlags(data.flags);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function toggle(flag: "user_score_fetch", value: boolean) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [flag]: value }),
      });
      const data = (await res.json()) as { ok: boolean; flags?: typeof flags; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed.");
      if (data.flags) setFlags(data.flags);
      setMessage("Settings saved.");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="subtle" style={{ padding: "2rem" }}>Loading settings…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        className="panel"
        style={{ borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.03)" }}
      >
        <span className="eyebrow">Feature Flags</span>
        <h2 style={{ marginTop: "0.4rem", marginBottom: "0.5rem" }}>User Permissions</h2>
        <p className="subtle" style={{ marginBottom: "1.25rem", fontSize: "0.88rem" }}>
          Control which features are accessible to regular room members.
        </p>

        {message && <div className="notice success" style={{ marginBottom: "0.75rem" }}>{message}</div>}
        {error   && <div className="notice warning" style={{ marginBottom: "0.75rem" }}>{error}</div>}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.2rem" }}>
              User Score Updates
            </div>
            <div className="subtle" style={{ fontSize: "0.82rem" }}>
              When ON — all room members see "Update Scores" on the results page.
              <br />
              When OFF — hidden for regular members. Room admins always see it regardless.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!flags?.user_score_fetch}
            disabled={saving || !flags}
            onClick={() => flags && void toggle("user_score_fetch", !flags.user_score_fetch)}
            style={{
              marginLeft: "1.5rem",
              flexShrink: 0,
              width: "52px",
              height: "28px",
              borderRadius: "14px",
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              background: flags?.user_score_fetch ? "var(--accent, #7468ff)" : "rgba(255,255,255,0.12)",
              position: "relative",
              transition: "background 0.2s",
              opacity: saving ? 0.6 : 1,
            }}
            aria-label={flags?.user_score_fetch ? "Disable user score updates" : "Enable user score updates"}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: flags?.user_score_fetch ? "26px" : "3px",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
                display: "block",
              }}
            />
          </button>
        </div>
      </div>

      <DangerZonePanel />
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────

export function AdminShell({ adminName }: { adminName: string }) {
  return (
    <main className="shell" style={{ paddingTop: "2rem" }}>
      {/* Header */}
      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <span className="eyebrow">Internal</span>
            <h1 className="page-title" style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", marginTop: "0.3rem", marginBottom: 0 }}>
              IPL Auction — Admin Panel
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link className="button ghost" href="/lobby" style={{ fontSize: "0.85rem" }}>
              ← Back to lobby
            </Link>
            <span className="pill highlight" style={{ fontSize: "0.78rem" }}>Superadmin</span>
            <span className="subtle" style={{ fontSize: "0.85rem" }}>{adminName}</span>
          </div>
        </div>
      </div>

      {/* Sections — each is an inline open/closable drawer */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <DrawerSection
          title="Score Sync"
          eyebrow="Cricsheet & Live data"
          accentColor="rgba(56,189,248,0.22)"
        >
          <ScoreSyncTab />
        </DrawerSection>

        <DrawerSection
          title="Rooms"
          eyebrow="Room overview"
          accentColor="rgba(99,102,241,0.2)"
        >
          <RoomsTab />
        </DrawerSection>

        <DrawerSection
          title="Players & Teams"
          eyebrow="Global player pool"
          accentColor="rgba(99,102,241,0.2)"
        >
          <PlayersTeamsTab />
        </DrawerSection>

        <DrawerSection
          title="Players & Points"
          eyebrow="Per-room stats"
          accentColor="rgba(251,191,36,0.2)"
        >
          <PlayersPointsTab />
        </DrawerSection>

        <DrawerSection
          title="Score Correction"
          eyebrow="Manual stat overrides"
          accentColor="rgba(183,121,31,0.25)"
        >
          <ScoreCorrectionTab />
        </DrawerSection>

        <DrawerSection
          title="Superadmins"
          eyebrow="Access control"
          accentColor="rgba(99,102,241,0.2)"
        >
          <SuperadminTab />
        </DrawerSection>

        <DrawerSection
          title="Settings"
          eyebrow="Feature flags & Danger zone"
          accentColor="rgba(239,68,68,0.18)"
        >
          <SettingsTab />
        </DrawerSection>
      </div>
    </main>
  );
}
