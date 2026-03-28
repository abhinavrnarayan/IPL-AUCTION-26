export function isMissingColumnError(message: string) {
  return (
    (message.includes("paused_remaining_ms") || message.includes("skip_vote_team_ids")) &&
    message.includes("auction_state")
  );
}

export function omitOptionalColumns<T extends Record<string, unknown>>(values: T) {
  const next = { ...values } as Record<string, unknown>;
  delete next.paused_remaining_ms;
  delete next.skip_vote_team_ids;
  return next;
}
