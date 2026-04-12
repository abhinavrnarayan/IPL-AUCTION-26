"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toErrorMessage } from "@/lib/utils";

type Mode = "idle" | "confirm" | "ready_to_fetch" | "done";

export function ResultsResetButton({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/reset-points`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; playersReset?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
      setMessage(`${data.playersReset ?? 0} players reset. Click "Update Scores" to rebuild.`);
      setMode("ready_to_fetch");
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
      setMode("idle");
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomCode}/fetch-points`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; playersUpdated?: number };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed.");
      const n = data.playersUpdated ?? 0;
      setMessage(n > 0 ? `${n} players updated.` : "No accepted match data found.");
      setMode("done");
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.45rem" }}>
        {/* ── Confirm modal trigger / ready state / done state ── */}
        {mode === "ready_to_fetch" ? (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="button"
              disabled={pending}
              onClick={() => void handleUpdate()}
              type="button"
            >
              {pending ? "Updating…" : "Update Scores"}
            </button>
            <button
              className="button ghost"
              disabled={pending}
              onClick={() => { setMode("idle"); setMessage(null); }}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="button ghost"
            disabled={pending}
            onClick={() => { setError(null); setMessage(null); setMode("confirm"); }}
            type="button"
          >
            {pending ? "Resetting…" : mode === "done" ? "Reset Points Again" : "Reset Points"}
          </button>
        )}

        {message && <div className="notice success" style={{ maxWidth: "320px" }}>{message}</div>}
        {error   && <div className="notice warning" style={{ maxWidth: "320px" }}>{error}</div>}
      </div>

      {mode === "confirm" && (
        <div
          className="app-modal-backdrop"
          onClick={() => !pending && setMode("idle")}
        >
          <div
            className="app-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-modal-head">
              <h3 style={{ margin: 0 }}>Reset room points</h3>
            </div>
            <p className="subtle" style={{ margin: 0, lineHeight: 1.6 }}>
              This will zero all player fantasy points. Stored match data is kept so you can click
              <strong> Update Scores</strong> right after to rebuild everything from scratch.
            </p>
            <div className="app-modal-actions">
              <button
                className="button ghost"
                disabled={pending}
                onClick={() => setMode("idle")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={pending}
                onClick={() => void handleReset()}
                type="button"
              >
                {pending ? "Resetting…" : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
