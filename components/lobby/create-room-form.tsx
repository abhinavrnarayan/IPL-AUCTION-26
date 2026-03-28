"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { RoomInvitePanel } from "@/components/room/room-invite-panel";
import { toErrorMessage } from "@/lib/utils";

const defaultForm = {
  name: "Premier Auction Room",
  purse: 1_500_000_000,
  squadSize: 18,
  timerSeconds: 20,
  bidIncrement: 1_000_000,
};

export function CreateRoomForm() {
  const [form, setForm] = useState(defaultForm);
  const [purseChoice, setPurseChoice] = useState<"100" | "150" | "200" | "custom">("150");
  const [customCrores, setCustomCrores] = useState(150);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<{
    code: string;
    name: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setCreatedRoom(null);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as {
        error?: string;
        room?: { code: string; name: string };
      };

      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Room creation failed.");
      }

      setCreatedRoom({
        code: payload.room.code,
        name: payload.room.name,
      });
    } catch (submitError) {
      setError(toErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="room-name">Room name</label>
        <input
          className="input"
          id="room-name"
          value={form.name}
          onChange={(event) =>
            setForm((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>

      <div className="form-grid two">
        <div className="field">
          <label htmlFor="room-purse">Purse</label>
          <select
            className="select"
            id="room-purse"
            value={purseChoice}
            onChange={(e) => {
              const choice = e.target.value as typeof purseChoice;
              setPurseChoice(choice);
              const crMap: Record<string, number> = { "100": 1_000_000_000, "150": 1_500_000_000, "200": 2_000_000_000 };
              if (choice !== "custom") setForm((f) => ({ ...f, purse: crMap[choice]! }));
            }}
          >
            <option value="100">₹100 Cr</option>
            <option value="150">₹150 Cr</option>
            <option value="200">₹200 Cr</option>
            <option value="custom">Custom</option>
          </select>
          {purseChoice === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.4rem" }}>
              <input
                className="input"
                min={1}
                step={1}
                type="number"
                value={customCrores}
                onChange={(e) => {
                  const cr = Number(e.target.value);
                  setCustomCrores(cr);
                  setForm((f) => ({ ...f, purse: cr * 10_000_000 }));
                }}
                style={{ maxWidth: "120px" }}
              />
              <span className="subtle">Crores</span>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="room-squad-size">Squad size</label>
          <input
            className="input"
            id="room-squad-size"
            min={1}
            step={1}
            type="number"
            value={form.squadSize}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                squadSize: Number(event.target.value),
              }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="room-timer">Bid timer</label>
          <select
            className="select"
            id="room-timer"
            value={form.timerSeconds}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                timerSeconds: Number(event.target.value),
              }))
            }
          >
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={15}>15 seconds</option>
            <option value={20}>20 seconds</option>
            <option value={30}>30 seconds</option>
            <option value={45}>45 seconds</option>
            <option value={60}>60 seconds</option>
          </select>
        </div>
      </div>

      {error ? <div className="notice warning">{error}</div> : null}
      {createdRoom ? (
        <RoomInvitePanel
          openRoomHref={`/room/${createdRoom.code}`}
          roomCode={createdRoom.code}
          roomName={createdRoom.name}
        />
      ) : null}

      <button className="button" disabled={pending} type="submit">
        {pending ? "Creating room..." : "Create room"}
      </button>
    </form>
  );
}
