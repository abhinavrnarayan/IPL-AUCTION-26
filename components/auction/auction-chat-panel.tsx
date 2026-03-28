"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { spring } from "@/lib/animations";

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
  const reduced = useReducedMotion();
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
          <motion.button
            key={emoji}
            className="button ghost"
            onClick={() => void onSendEmoji(emoji)}
            type="button"
            whileHover={reduced ? undefined : { scale: 1.2, y: -2 }}
            whileTap={reduced ? undefined : { scale: 0.85 }}
            transition={spring.bouncy}
          >
            {emoji}
          </motion.button>
        ))}
      </div>

      <div className="auction-chat-log" ref={listRef}>
        {messages.length === 0 ? (
          <div className="auction-chat-empty">
            Start the chat. Messages and emoji reactions will appear here live.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <motion.div
                className={`auction-chat-message${message.isOwn ? " own" : ""}`}
                key={message.id}
                initial={reduced ? undefined : { opacity: 0, y: 10, scale: 0.97 }}
                animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
                transition={{ ...spring.snappy, duration: 0.18 }}
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
              </motion.div>
            ))}
          </AnimatePresence>
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
        <motion.button
          className="button secondary"
          disabled={sending || messageInput.trim().length === 0}
          onClick={() => void handleSubmit()}
          type="button"
          whileHover={reduced ? undefined : { scale: 1.04 }}
          whileTap={reduced ? undefined : { scale: 0.96 }}
          transition={spring.snappy}
        >
          {sending ? "Sending..." : "Send"}
        </motion.button>
      </div>
    </div>
  );
}
