"use client";

import { motion, useReducedMotion } from "framer-motion";

export function TimerBar({
  remainingSeconds,
  totalSeconds,
  isPaused,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  isPaused: boolean;
}) {
  const reduced = useReducedMotion();
  const ratio = totalSeconds === 0 ? 0 : Math.max(0, remainingSeconds) / totalSeconds;
  const percentage = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  const urgency =
    isPaused ? "paused"
    : remainingSeconds <= 5 ? "critical"
    : remainingSeconds <= 10 ? "warning"
    : "normal";

  const fillColor =
    urgency === "critical" ? "linear-gradient(90deg, #f43f5e, #fb7185)"
    : urgency === "warning"  ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
    : "linear-gradient(90deg, var(--primary), var(--primary-strong))";

  return (
    <div>
      <div className="timer-track">
        <motion.div
          className="timer-fill"
          animate={
            !reduced && urgency === "critical"
              ? { scaleY: [1, 1.15, 1], opacity: [1, 0.85, 1] }
              : !reduced && urgency === "warning"
              ? { scaleY: [1, 1.05, 1] }
              : {}
          }
          transition={
            urgency === "critical"
              ? { repeat: Infinity, duration: 0.35, ease: "easeInOut" }
              : urgency === "warning"
              ? { repeat: Infinity, duration: 0.7, ease: "easeInOut" }
              : {}
          }
          style={{
            width: `${percentage}%`,
            background: fillColor,
            transition: isPaused ? "none" : "width 1000ms linear",
            originY: "center",
            boxShadow:
              urgency === "critical" ? "0 0 14px rgba(244,63,94,0.6)"
              : urgency === "warning" ? "0 0 10px rgba(245,158,11,0.45)"
              : undefined,
          }}
        />
      </div>
      <div className="timer-meta">
        <span>{isPaused ? "Paused" : "Live timer"}</span>
        <motion.strong
          key={remainingSeconds}
          animate={
            !reduced && urgency === "critical"
              ? { scale: [1, 1.18, 1] }
              : {}
          }
          transition={{ duration: 0.3 }}
          style={{
            color:
              urgency === "critical" ? "var(--danger)"
              : urgency === "warning"  ? "var(--warning)"
              : undefined,
          }}
        >
          {remainingSeconds}s
        </motion.strong>
      </div>
    </div>
  );
}
