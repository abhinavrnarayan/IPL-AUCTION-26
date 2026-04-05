"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toErrorMessage } from "@/lib/utils";

export function ResultsResetButton({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/results/reset`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        playersReset?: number;
        syncRowsCleared?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not reset points.");
      }

      setConfirmOpen(false);
      setMessage(
        `Reset points for ${payload.playersReset ?? 0} players and cleared ${payload.syncRowsCleared ?? 0} stored live-score rows.`,
      );
      router.refresh();
    } catch (resetError) {
      setError(toErrorMessage(resetError));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.45rem" }}>
        <button
          className="button danger"
          disabled={pending}
          onClick={() => {
            setError(null);
            setMessage(null);
            setConfirmOpen(true);
          }}
          type="button"
        >
          {pending ? "Resetting..." : "Reset points"}
        </button>
        {message ? <div className="notice success" style={{ maxWidth: "320px" }}>{message}</div> : null}
        {error ? <div className="notice warning" style={{ maxWidth: "320px" }}>{error}</div> : null}
      </div>

      {confirmOpen ? (
        <div className="app-modal-backdrop" onClick={() => (!pending ? setConfirmOpen(false) : undefined)}>
          <div
            className="app-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="app-modal-head">
              <h3 style={{ margin: 0 }}>Reset room points</h3>
            </div>
            <p className="subtle" style={{ margin: 0, lineHeight: 1.6 }}>
              Reset all player points in this room and clear the stored live-score sync data so you can fetch, approve, and calculate everything again from scratch?
            </p>
            <div className="app-modal-actions">
              <button
                className="button ghost"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
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
                {pending ? "Resetting..." : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
