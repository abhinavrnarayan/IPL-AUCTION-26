"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { RoomMember, Team } from "@/lib/domain/types";
import { formatAmountInput, formatCurrency, parseAmountInput, toErrorMessage } from "@/lib/utils";

interface TeamOwnershipPanelProps {
  roomCode: string;
  teams: Team[];
  members: RoomMember[];
}

export function TeamOwnershipPanel({
  roomCode,
  teams,
  members,
}: TeamOwnershipPanelProps) {
  const router = useRouter();
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purseDrafts, setPurseDrafts] = useState<Record<string, string>>(
    Object.fromEntries(teams.map((team) => [team.id, formatAmountInput(team.purseRemaining)])),
  );

  const assignableMembers = members.filter((member) => member.isPlayer);
  const memberById = new Map(assignableMembers.map((member) => [member.userId, member]));

  async function updateOwner(teamId: string, ownerUserId: string) {
    setPendingTeamId(teamId);
    setError(null);

    try {
      const response = await fetch(`/api/rooms/${roomCode}/teams/${teamId}/owner`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerUserId: ownerUserId || null,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update team owner.");
      }

      router.refresh();
    } catch (assignError) {
      setError(toErrorMessage(assignError));
    } finally {
      setPendingTeamId(null);
    }
  }

  async function updatePurse(teamId: string) {
    setPendingTeamId(teamId);
    setError(null);

    try {
      const purseRemaining = parseAmountInput(purseDrafts[teamId] ?? "");
      const response = await fetch(`/api/rooms/${roomCode}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purseRemaining,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update team purse.");
      }

      router.refresh();
    } catch (updateError) {
      setError(toErrorMessage(updateError));
    } finally {
      setPendingTeamId(null);
    }
  }

  return (
    <div className="form-grid">
      <div className="subtle">
        Assign joined room members to teams. Each member can only own one team at a time.
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <div className="team-grid">
        {teams.map((team) => {
          const owner = team.ownerUserId ? memberById.get(team.ownerUserId) ?? null : null;

          return (
            <div className="room-card" key={team.id}>
              <div className="header-row">
                <strong>{team.name}</strong>
                <span className="pill">{team.shortCode}</span>
              </div>
              <div className="subtle" style={{ marginBottom: "0.75rem" }}>
                Owner: {owner?.displayName ?? owner?.email ?? "Unassigned"}
              </div>
              <div className="subtle" style={{ marginBottom: "0.75rem" }}>
                Purse left: {formatCurrency(team.purseRemaining)}
              </div>
              <select
                className="select"
                disabled={pendingTeamId === team.id}
                value={team.ownerUserId ?? ""}
                onChange={(event) => void updateOwner(team.id, event.target.value)}
              >
                <option value="">Unassigned</option>
                {assignableMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName ?? member.email ?? member.userId}
                  </option>
                ))}
              </select>
              <div
                style={{
                  display: "grid",
                  gap: "0.5rem",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  marginTop: "0.75rem",
                }}
              >
                <input
                  className="input"
                  disabled={pendingTeamId === team.id}
                  inputMode="text"
                  placeholder="50L or 2Cr"
                  onChange={(event) =>
                    setPurseDrafts((current) => ({
                      ...current,
                      [team.id]: event.target.value,
                    }))
                  }
                  type="text"
                  value={purseDrafts[team.id] ?? formatAmountInput(team.purseRemaining)}
                />
                <button
                  className="button ghost"
                  disabled={pendingTeamId === team.id}
                  onClick={() => void updatePurse(team.id)}
                  type="button"
                >
                  {pendingTeamId === team.id ? "Saving..." : "Save purse"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
