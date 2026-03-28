"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { toErrorMessage } from "@/lib/utils";

export function SelfCreateTeamForm({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (name.trim().length < 2) {
      setError("Team name must be at least 2 characters.");
      return;
    }
    if (shortCode.trim().length < 2 || shortCode.trim().length > 6) {
      setError("Short code must be between 2 and 6 characters.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/teams/self`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, shortCode }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Team creation failed.");
      }

      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="team-name">Team Name</label>
        <input
          className="input"
          disabled={pending}
          id="team-name"
          placeholder="e.g. Royal Challengers"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="team-short">Short Code (up to 6 chars)</label>
        <input
          className="input mono"
          disabled={pending}
          id="team-short"
          maxLength={6}
          placeholder="e.g. RCB"
          style={{ textTransform: "uppercase" }}
          value={shortCode}
          onChange={(e) => setShortCode(e.target.value)}
        />
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <button className="button" disabled={pending || !name || !shortCode} type="submit">
        {pending ? "Creating..." : "Create and Claim Team"}
      </button>
    </form>
  );
}
