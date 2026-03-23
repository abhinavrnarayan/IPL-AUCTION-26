"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { toErrorMessage } from "@/lib/utils";

export function JoinRoomForm() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const payload = (await response.json()) as {
        error?: string;
        room?: { code: string };
      };

      if (response.status === 401) {
        window.location.assign(`/login?next=/lobby`);
        return;
      }

      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Room join failed.");
      }

      window.location.assign(`/room/${payload.room.code}`);
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="room-code">Room code</label>
        <input
          className="input mono"
          id="room-code"
          maxLength={8}
          placeholder="AB12CD"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <button className="button secondary" disabled={pending} type="submit">
        {pending ? "Joining..." : "Join room"}
      </button>
    </form>
  );
}
