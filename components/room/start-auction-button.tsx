"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toErrorMessage } from "@/lib/utils";

export function StartAuctionButton({
  roomCode,
  disabled,
  label = "Start auction",
}: {
  roomCode: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/auction/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to start auction.");
      }

      router.push(`/auction/${roomCode}`);
      router.refresh();
    } catch (startError) {
      setError(toErrorMessage(startError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-grid">
      {error ? <div className="notice warning">{error}</div> : null}
      <button
        className="button"
        disabled={disabled || pending}
        onClick={handleStart}
        type="button"
      >
        {pending ? "Starting..." : label}
      </button>
    </div>
  );
}
