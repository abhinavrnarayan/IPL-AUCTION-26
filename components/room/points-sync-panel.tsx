"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toErrorMessage } from "@/lib/utils";

type Mode = "idle" | "ready_to_fetch" | "done";

export function PointsSyncPanel({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/reset-points`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; playersReset?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
      setMessage(
        `${data.playersReset ?? 0} players reset. Click "Update Scores" to rebuild from stored match data.`,
      );
      setMode("ready_to_fetch");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFetch() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/fetch-points`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; playersUpdated?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Fetch failed.");
      const n = data.playersUpdated ?? 0;
      setMessage(
        n > 0
          ? `Done — ${n} players updated from accepted match data.`
          : "Done — no accepted match data found for this room yet.",
      );
      setMode("done");
      router.push(`/results/${roomCode}`);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {message && (
        <div className="notice success" style={{ marginBottom: "0.75rem" }}>
          {message}
        </div>
      )}
      {error && (
        <div className="notice warning" style={{ marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
        {mode === "ready_to_fetch" ? (
          <>
            <button
              className="button"
              onClick={() => void handleFetch()}
              disabled={busy}
              type="button"
            >
              {busy ? "Updating…" : "Update Scores"}
            </button>
            <button
              className="button ghost"
              onClick={() => { setMode("idle"); setMessage(null); }}
              disabled={busy}
              type="button"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="button ghost"
            onClick={() => void handleReset()}
            disabled={busy}
            type="button"
          >
            {busy ? "Resetting…" : mode === "done" ? "Reset Points Again" : "Reset Points"}
          </button>
        )}
      </div>
    </div>
  );
}
