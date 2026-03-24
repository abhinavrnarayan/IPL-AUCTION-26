export function isMissingPausedRemainingMsColumnError(message: string) {
  return (
    message.includes("paused_remaining_ms") &&
    message.includes("auction_state")
  );
}

export function omitPausedRemainingMs<T extends Record<string, unknown>>(values: T) {
  const next = { ...values } as Record<string, unknown>;
  delete next.paused_remaining_ms;
  return next;
}
