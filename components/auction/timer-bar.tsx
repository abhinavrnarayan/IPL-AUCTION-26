export function TimerBar({
  remainingSeconds,
  totalSeconds,
  isPaused,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  isPaused: boolean;
}) {
  const ratio = totalSeconds === 0 ? 0 : Math.max(0, remainingSeconds) / totalSeconds;
  const percentage = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const isLow = remainingSeconds <= 10 && !isPaused;

  return (
    <div>
      <div className="timer-track">
        <div
          className="timer-fill"
          style={{
            width: `${percentage}%`,
            transition: isPaused ? "none" : "width 1000ms linear",
            background: isLow
              ? "linear-gradient(90deg, var(--danger), #e05c5c)"
              : undefined,
          }}
        />
      </div>
      <div className="timer-meta">
        <span>{isPaused ? "Paused" : "Live timer"}</span>
        <strong style={{ color: isLow ? "var(--danger)" : undefined }}>
          {remainingSeconds}s
        </strong>
      </div>
    </div>
  );
}
