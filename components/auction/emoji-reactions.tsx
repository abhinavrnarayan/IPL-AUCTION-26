"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { spring } from "@/lib/animations";
import type { EmojiReaction } from "@/lib/domain/types";

const quickReactions = ["🔥", "👏", "😮", "😂", "💸", "🏏"];

type Particle = {
  id: number;
  emoji: string;
  x: number;
  y: number;
  dx: number;
};

export function EmojiReactions({
  recent,
  onSend,
}: {
  recent: EmojiReaction[];
  onSend: (emoji: string) => Promise<void>;
}) {
  const reduced = useReducedMotion();
  const [particles, setParticles] = useState<Particle[]>([]);
  const counterRef = useRef(0);

  const removeParticle = useCallback((id: number) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  function spawnBurst(emoji: string) {
    if (reduced) return;
    const count = 6;
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: counterRef.current++,
      emoji,
      x: 0,
      y: 0,
      dx: (i - (count - 1) / 2) * 22 + (Math.random() - 0.5) * 16,
    }));
    setParticles((prev) => [...prev, ...newParticles]);
  }

  return (
    <div className="panel">
      <h2>Emoji reactions</h2>
      <div className="emoji-row" style={{ position: "relative" }}>
        {quickReactions.map((emoji) => (
          <div key={emoji} style={{ position: "relative" }}>
            <motion.button
              className="button ghost"
              onClick={() => {
                spawnBurst(emoji);
                void onSend(emoji);
              }}
              type="button"
              whileHover={reduced ? undefined : { scale: 1.25, y: -3 }}
              whileTap={reduced ? undefined : { scale: 0.8, rotate: [-5, 5, 0] }}
              transition={spring.bouncy}
            >
              {emoji}
            </motion.button>

            {/* Burst particles */}
            <AnimatePresence>
              {particles
                .filter((p) => p.emoji === emoji)
                .map((particle) => (
                  <motion.span
                    key={particle.id}
                    initial={{ opacity: 1, y: 0, x: particle.dx * 0.1, scale: 1 }}
                    animate={{
                      opacity: 0,
                      y: -(60 + Math.random() * 30),
                      x: particle.dx,
                      scale: 1.5,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.85, ease: "easeOut" }}
                    onAnimationComplete={() => removeParticle(particle.id)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      fontSize: "1.3rem",
                      pointerEvents: "none",
                      userSelect: "none",
                      zIndex: 50,
                    }}
                  >
                    {particle.emoji}
                  </motion.span>
                ))}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <div className="card-list" style={{ marginTop: "0.9rem" }}>
        {recent.length === 0 ? (
          <div className="empty-state">No reactions yet.</div>
        ) : (
          <AnimatePresence initial={false}>
            {recent.map((reaction, index) => (
              <motion.div
                className="bid-row"
                key={`${reaction.sentAt}-${index}`}
                initial={reduced ? undefined : { opacity: 0, x: -10 }}
                animate={reduced ? undefined : { opacity: 1, x: 0 }}
                transition={spring.snappy}
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
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
