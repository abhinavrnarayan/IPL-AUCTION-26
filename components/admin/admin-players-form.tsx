"use client";

/**
 * Global player pool management for superadmin.
 * All uploads push to EVERY room. Teams remain per-room.
 */

import Papa from "papaparse";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";

import { toErrorMessage } from "@/lib/utils";

interface RoomCount {
  id: string;
  code: string;
  name: string;
  playerCount: number;
}

async function readTabularRows(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    const text = await file.text();
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data),
        error: (e: Error) => reject(e),
      });
    });
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  }
  throw new Error("Only CSV and Excel files are supported.");
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parsePlayers(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeKey(k), v]));
      const name = r.name ?? r.player;
      const stats: Record<string, unknown> = Object.fromEntries(
        Object.entries(r).filter(
          ([k]) => !["#", "name", "player", "role", "nationality", "baseprice", "iplteam"].includes(k),
        ),
      );
      if (r.iplteam) stats.iplTeam = String(r.iplteam).trim();
      const idx = r["#"];
      if (idx !== undefined && idx !== null && idx !== "") {
        const n = Number(idx);
        stats.sourceIndex = Number.isFinite(n) ? n : String(idx).trim();
      }
      const bp = Number(r.baseprice ?? 0);
      return {
        name: String(name ?? "").trim(),
        role: String(r.role ?? "").trim(),
        nationality: r.nationality ? String(r.nationality).trim() : null,
        basePrice: Number.isFinite(bp) ? bp : 0,
        stats: Object.keys(stats).length > 0 ? stats : null,
        currentTeamId: null as string | null,
      };
    })
    .filter((p) => p.name && p.role);
}

export function AdminPlayersForm() {
  const [rooms, setRooms] = useState<RoomCount[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeName, setRemoveName] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCounts() {
    try {
      const res = await fetch("/api/admin/players");
      const data = (await res.json()) as { ok: boolean; rooms?: RoomCount[] };
      if (data.ok) setRooms(data.rooms ?? []);
    } catch { /* ignore */ } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => { void loadCounts(); }, []);

  const anyPending = uploading || loadingDefault || removing;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const rows = await readTabularRows(file);
      const players = parsePlayers(rows);
      if (players.length === 0) throw new Error("No valid players found in the file.");
      const res = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        roomsUpdated?: number;
        totalImported?: number;
        errors?: string[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Upload failed.");
      setMessage(
        `${data.totalImported ?? 0} players added across ${data.roomsUpdated ?? 0} rooms.` +
          (data.errors?.length ? ` Warnings: ${data.errors.join("; ")}` : ""),
      );
      void loadCounts();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleLoadDefault() {
    setLoadingDefault(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/players/default", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        roomsUpdated?: number;
        totalImported?: number;
        errors?: string[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      setMessage(
        `Default pool loaded: ${data.totalImported ?? 0} players across ${data.roomsUpdated ?? 0} rooms.` +
          (data.errors?.length ? ` Skipped: ${data.errors.join("; ")}` : ""),
      );
      void loadCounts();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoadingDefault(false);
    }
  }

  async function handleRemoveByName() {
    const name = removeName.trim();
    if (!name) return;
    setRemoving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/players", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; totalDeleted?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      setMessage(`Removed ${data.totalDeleted ?? 0} entries for "${name}" across all rooms.`);
      setRemoveName("");
      void loadCounts();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  async function handleClearAll() {
    setRemoving(true);
    setConfirmClear(false);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/players", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeAll: true }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; totalDeleted?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      setMessage(`Cleared ${data.totalDeleted ?? 0} player entries from all rooms.`);
      void loadCounts();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Per-room counts */}
      {!loadingRooms && rooms.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {rooms.map((r) => (
            <span key={r.code} className="pill" style={{ fontSize: "0.78rem" }}>
              {r.name} ({r.code}) — {r.playerCount} players
            </span>
          ))}
        </div>
      )}

      {/* File upload */}
      <div>
        <div className="field" style={{ marginBottom: "0.4rem" }}>
          <label>Upload player list (CSV / XLSX) — pushed to all rooms</label>
          <input
            className="input"
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={anyPending}
            onChange={handleFile}
          />
        </div>
        <div className="subtle" style={{ fontSize: "0.8rem" }}>
          Columns: <code>name</code>, <code>role</code>, optional <code>nationality</code> and <code>basePrice</code>.
        </div>
      </div>

      {/* Default pool */}
      <button
        className="button secondary"
        disabled={anyPending}
        onClick={() => void handleLoadDefault()}
        type="button"
      >
        {loadingDefault ? "Loading…" : "Load default IPL player pool to all rooms"}
      </button>

      {/* Remove by name */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1.1rem" }}>
        <h3 style={{ margin: "0 0 0.65rem", fontSize: "0.92rem" }}>Remove player from all rooms</h3>
        <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Exact player name"
            value={removeName}
            onChange={(e) => setRemoveName(e.target.value)}
            disabled={anyPending}
            style={{ flex: 1, minWidth: "200px" }}
          />
          <button
            className="button ghost"
            disabled={anyPending || !removeName.trim()}
            onClick={() => void handleRemoveByName()}
            type="button"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>

      {/* Clear all */}
      <div>
        {confirmClear ? (
          <div className="notice warning" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontSize: "0.85rem" }}>
              This will delete ALL players from ALL rooms. This cannot be undone.
            </span>
            <button
              className="button"
              onClick={() => void handleClearAll()}
              disabled={removing}
              type="button"
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
            >
              {removing ? "Clearing…" : "Confirm — clear all"}
            </button>
            <button
              className="button ghost"
              onClick={() => setConfirmClear(false)}
              type="button"
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="button ghost"
            style={{ fontSize: "0.82rem", color: "var(--error, #f87171)" }}
            onClick={() => setConfirmClear(true)}
            disabled={anyPending}
            type="button"
          >
            Clear all players from all rooms
          </button>
        )}
      </div>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice warning">{error}</div>}
    </div>
  );
}
