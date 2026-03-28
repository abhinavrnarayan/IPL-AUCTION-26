"use client";

import { useEffect, useRef, useState } from "react";

const quickChatEmojis = ["🔥", "👏", "😮", "😂", "💸", "🏏"];

export type AuctionChatMessage = {
  id: string;
  kind: "text" | "emoji";
  userName: string;
  userTag?: string | null;
  text: string;
  sentAt: string;
  isOwn?: boolean;
};

export function AuctionChatPanel({
  messages,
  onSendEmoji,
  onSendMessage,
}: {
  messages: AuctionChatMessage[];
  onSendEmoji: (emoji: string) => Promise<void>;
  onSendMessage: (message: string) => Promise<void>;
}) {
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function handleSubmit() {
    const trimmed = messageInput.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSendMessage(trimmed);
      setMessageInput("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auction-chat-panel">
      <div className="auction-chat-head">
        <h3 style={{ margin: 0 }}>Room chat</h3>
        <span className="subtle" style={{ fontSize: "0.8rem" }}>
          Live messages and emoji reactions
        </span>
      </div>

      <div className="auction-chat-emoji-row">
        {quickChatEmojis.map((emoji) => (
          <button
            key={emoji}
            className="button ghost"
            onClick={() => void onSendEmoji(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="auction-chat-log" ref={listRef}>
        {messages.length === 0 ? (
          <div className="auction-chat-empty">
            Start the chat. Messages and emoji reactions will appear here live.
          </div>
        ) : (
          messages.map((message) => (
            <div
              className={`auction-chat-message${message.isOwn ? " own" : ""}`}
              key={message.id}
            >
              <div className="auction-chat-meta">
                <strong>{message.userName}</strong>
                {message.userTag ? (
                  <span className="pill" style={{ fontSize: "0.68rem", padding: "0.16rem 0.42rem" }}>
                    {message.userTag}
                  </span>
                ) : null}
              </div>
              <div className={`auction-chat-bubble ${message.kind}`}>
                {message.text}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="auction-chat-composer">
        <input
          className="input"
          maxLength={180}
          onChange={(event) => setMessageInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Type a message..."
          type="text"
          value={messageInput}
        />
        <button
          className="button secondary"
          disabled={sending || messageInput.trim().length === 0}
          onClick={() => void handleSubmit()}
          type="button"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}

