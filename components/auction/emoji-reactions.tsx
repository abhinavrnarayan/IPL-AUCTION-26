"use client";

import type { EmojiReaction } from "@/lib/domain/types";

const quickReactions = ["🔥", "👏", "😮", "😂", "💸", "🏏"];

export function EmojiReactions({
  recent,
  onSend,
}: {
  recent: EmojiReaction[];
  onSend: (emoji: string) => Promise<void>;
}) {
  return (
    <div className="panel">
      <h2>Emoji reactions</h2>
      <div className="emoji-row">
        {quickReactions.map((emoji) => (
          <button
            key={emoji}
            className="button ghost"
            onClick={() => void onSend(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="card-list" style={{ marginTop: "0.9rem" }}>
        {recent.length === 0 ? (
          <div className="empty-state">No reactions yet.</div>
        ) : (
          recent.map((reaction, index) => (
            <div
              className="bid-row"
              key={`${reaction.sentAt}-${index}`}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.1rem" }}
            >
              <div>
                <strong>{reaction.emoji}</strong>{" "}
                <span>{reaction.userName}</span>
              </div>
              {reaction.context ? (
                <div className="subtle mono" style={{ fontSize: "0.78rem" }}>
                  {reaction.context}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
