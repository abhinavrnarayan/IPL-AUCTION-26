"use client";

import { useState } from "react";

type RoomInvitePanelProps = {
  roomCode: string;
  roomName?: string;
  openRoomHref?: string;
};

export function RoomInvitePanel({
  roomCode,
  roomName = "IPL Auction Room",
  openRoomHref,
}: RoomInvitePanelProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const inviteMessage = `Join ${roomName} with room code ${roomCode}.`;

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setFeedback("Room code copied.");
    } catch {
      setFeedback("Copy failed. Select the room code manually.");
    }
  }

  async function handleShareInvite() {
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: roomName,
          text: inviteMessage,
        });
        setFeedback("Invite shared.");
      } else {
        await navigator.clipboard.writeText(inviteMessage);
        setFeedback("Share message copied.");
      }
    } catch {
      setFeedback("Share cancelled. You can still copy the room code.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="invite-panel">
      <div className="header-row">
        <div>
          <span className="eyebrow">Share Room Code</span>
          <h3 style={{ marginTop: "0.5rem" }}>Invite participants with this code</h3>
          <p className="subtle" style={{ margin: "0.35rem 0 0" }}>
            Share the code below so the rest of the room can join from the lobby.
          </p>
        </div>
      </div>
      <div className="invite-code">{roomCode}</div>
      <div className="button-row">
        <button className="button secondary" onClick={handleCopyCode} type="button">
          Copy code
        </button>
        <button
          className="button"
          disabled={sharing}
          onClick={handleShareInvite}
          type="button"
        >
          {sharing ? "Sharing..." : "Share invite"}
        </button>
        {openRoomHref ? (
          <a className="button ghost" href={openRoomHref}>
            Open room
          </a>
        ) : null}
      </div>
      {feedback ? <div className="notice" style={{ marginTop: "0.9rem" }}>{feedback}</div> : null}
    </div>
  );
}
