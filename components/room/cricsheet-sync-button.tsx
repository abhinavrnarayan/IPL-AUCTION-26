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
  const [mode, setMode] = useState<"fetch" | "upload" | "json">("fetch");
  const [season, setSeason] = useState("2026");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setPending(true);
    setResult(null);
    setError(null);

    try {
      let response: Response;

      if (mode === "upload" || mode === "json") {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError(mode === "json" ? "Select a JSON match file first." : "Select the IPL ZIP file first.");
          setPending(false);
          return;
        }

        const form = new FormData();
        form.append("file", file);
        form.append("season", season);
        response = await fetch(`/api/rooms/${roomCode}/cricsheet-sync`, {
          method: "POST",
          body: form,
        });
      } else {
        response = await fetch(`/api/rooms/${roomCode}/cricsheet-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season }),
        });
      }

      const payload = (await response.json()) as SyncResult;
      if (!response.ok) throw new Error(payload.error ?? "Sync failed.");

      setResult(payload);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="field">
        <label>IPL season</label>
        <input
          className="input"
          disabled={pending || mode === "json"}
          onChange={(event) => setSeason(event.target.value)}
          placeholder={mode === "json" ? "Taken from JSON file" : "e.g. 2026"}
          style={{ maxWidth: "8rem" }}
          type="text"
          value={mode === "json" ? "Auto" : season}
        />
        {mode === "json" && (
          <p className="subtle" style={{ fontSize: "0.78rem", marginTop: "0.4rem" }}>
            Single JSON uploads use the season inside the match file automatically.
          </p>
        )}
      </div>

      <div className="pill-row" style={{ gap: "0.5rem" }}>
        <button
          className={`button ${mode === "fetch" ? "" : "ghost"}`}
          disabled={pending}
          onClick={() => setMode("fetch")}
          type="button"
        >
          Auto-fetch
        </button>
        <button
          className={`button ${mode === "upload" ? "" : "ghost"}`}
          disabled={pending}
          onClick={() => setMode("upload")}
          type="button"
        >
          Upload ZIP
        </button>
        <button
          className={`button ${mode === "json" ? "" : "ghost"}`}
          disabled={pending}
          onClick={() => setMode("json")}
          type="button"
        >
          Upload JSON
        </button>
      </div>

      {mode === "fetch" && (
        <p className="subtle" style={{ fontSize: "0.85rem" }}>
          Downloads the IPL ZIP from Cricsheet and syncs the {season} season. This can take
          around 15-30 seconds.
        </p>
      )}

      {mode === "upload" && (
        <div className="field">
          <label htmlFor="cricsheet-zip">
            Full season ZIP from <span className="mono">cricsheet.org/downloads/ipl_json.zip</span>
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

      {mode === "json" && (
        <div className="field">
          <label htmlFor="cricsheet-json">
            Single match JSON from <span className="mono">cricsheet.org/matches/ipl/</span>
          </label>
          <input
            accept=".json"
            className="input"
            disabled={pending}
            id="cricsheet-json"
            ref={fileRef}
            type="file"
          />
        </div>
      )}

      {result?.ok && (
        <div className="notice success">
          <strong>Sync complete for {result.season}</strong>
          <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <span className="pill">{result.matchesProcessed} matches processed</span>
            <span className="pill highlight">{result.playersMatched} players matched</span>
            {(result.playersUnmatched ?? 0) > 0 && (
              <span className="pill">{result.playersUnmatched} unmatched</span>
            )}
          </div>
          {result.unmatchedNames && result.unmatchedNames.length > 0 && (
            <div className="subtle" style={{ marginTop: "0.5rem", fontSize: "0.78rem" }}>
              <strong>Unmatched players:</strong> {result.unmatchedNames.join(", ")}
              {(result.playersUnmatched ?? 0) > result.unmatchedNames.length ? " ..." : ""}
            </div>
          )}
        </div>
      )}

      {result && !result.ok && <div className="notice warning">{result.error}</div>}
      {error && <div className="notice warning">{error}</div>}

      <button
        className="button secondary"
        disabled={pending}
        onClick={() => void handleSync()}
        type="button"
      >
        {pending
          ? "Syncing..."
          : mode === "json"
            ? "Sync match JSON"
            : "Sync Cricsheet data"}
      </button>
    </div>
  );
}
