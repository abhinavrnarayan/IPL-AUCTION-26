"use client";

import { useRef, useState } from "react";

import { toErrorMessage } from "@/lib/utils";

interface SyncResult {
  ok: boolean;
  season?: string;
  matchesProcessed?: number;
  matchesSkipped?: number;
  playersMatched?: number;
  playersUnmatched?: number;
  unmatchedNames?: string[];
  seasons?: string[];
  error?: string;
}

export function CricsheetSyncButton({ roomCode }: { roomCode: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"fetch" | "upload">("fetch");
  const [season, setSeason] = useState("2026");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setPending(true);
    setResult(null);
    setError(null);

    try {
      let res: Response;

      if (mode === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError("Select the ipl_json.zip file first.");
          setPending(false);
          return;
        }
        const form = new FormData();
        form.append("file", file);
        form.append("season", season);
        res = await fetch(`/api/rooms/${roomCode}/cricsheet-sync`, {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch(`/api/rooms/${roomCode}/cricsheet-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season }),
        });
      }

      const payload = (await res.json()) as SyncResult;
      if (!res.ok) throw new Error(payload.error ?? "Sync failed.");
      setResult(payload);

      if (payload.playersMatched && payload.playersMatched > 0) {
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="field">
        <label>IPL Season</label>
        <input
          className="input"
          disabled={pending}
          onChange={(e) => setSeason(e.target.value)}
          placeholder="e.g. 2026"
          style={{ maxWidth: "8rem" }}
          type="text"
          value={season}
        />
      </div>

      <div className="pill-row" style={{ gap: "0.5rem" }}>
        <button
          className={`button ${mode === "fetch" ? "" : "ghost"}`}
          disabled={pending}
          onClick={() => setMode("fetch")}
          type="button"
        >
          Auto-fetch from Cricsheet
        </button>
        <button
          className={`button ${mode === "upload" ? "" : "ghost"}`}
          disabled={pending}
          onClick={() => setMode("upload")}
          type="button"
        >
          Upload ZIP
        </button>
      </div>

      {mode === "fetch" && (
        <p className="subtle" style={{ fontSize: "0.85rem" }}>
          Downloads <span className="mono">ipl_json.zip</span> directly from cricsheet.org and
          processes all {season} season matches. May take 15–30 seconds.
        </p>
      )}

      {mode === "upload" && (
        <div className="field">
          <label htmlFor="cricsheet-zip">
            ipl_json.zip — download from{" "}
            <span className="mono">cricsheet.org/downloads/ipl_json.zip</span>
          </label>
          <input
            accept=".zip"
            className="input"
            disabled={pending}
            id="cricsheet-zip"
            ref={fileRef}
            type="file"
          />
        </div>
      )}

      {result?.ok && (
        <div className="notice success">
          <strong>Sync complete — {result.season} season</strong>
          <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <span className="pill">{result.matchesProcessed} matches processed</span>
            <span className="pill highlight">{result.playersMatched} players matched</span>
            {(result.playersUnmatched ?? 0) > 0 && (
              <span className="pill">{result.playersUnmatched} unmatched</span>
            )}
          </div>
          {result.unmatchedNames && result.unmatchedNames.length > 0 && (
            <div className="subtle" style={{ marginTop: "0.5rem", fontSize: "0.78rem" }}>
              <strong>Unmatched players</strong> (check spelling in your sheet):{" "}
              {result.unmatchedNames.join(", ")}
              {(result.playersUnmatched ?? 0) > result.unmatchedNames.length ? " …" : ""}
            </div>
          )}
        </div>
      )}

      {result && !result.ok && (
        <div className="notice warning">{result.error}</div>
      )}

      {error && <div className="notice warning">{error}</div>}

      <button
        className="button secondary"
        disabled={pending}
        onClick={() => void handleSync()}
        type="button"
      >
        {pending ? "Syncing Cricsheet data…" : "Sync Cricsheet data"}
      </button>
    </div>
  );
}
