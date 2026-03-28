export const ROOM_EVENTS = {
  newBid: "NEW_BID",
  playerSold: "PLAYER_SOLD",
  playerUnsold: "PLAYER_UNSOLD",
  auctionStarted: "AUCTION_STARTED",
  auctionPaused: "AUCTION_PAUSED",
  auctionResumed: "AUCTION_RESUMED",
  roundChanged: "ROUND_CHANGED",
  tradeExecuted: "TRADE_EXECUTED",
  emoji: "EMOJI_REACTION",
  chatMessage: "CHAT_MESSAGE",
} as const;

export function getRoomChannelName(roomCode: string) {
  return `room:${roomCode}`;
}
