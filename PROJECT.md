# IPL AUCTION PLATFORM — PRD v2 (Implementation Ready)

## 1. Authentication
- Google Sign-In via Supabase Auth

## 2. Roles & Permissions
- Admin, Player, Admin+Player
- Multiple admins allowed

## 3. Room System
- Join via code
- Configurable purse, squad size, timer
- Fixed bid increments with rules

## 4. Auction Engine
- States: WAITING → LIVE → PAUSED → ROUND_END → COMPLETED
- Timer resets on bid
- Server authoritative timer
- Auto end when conditions met

## 5. Round System
- Round 1: All players
- Round 2: Unsold players only

## 6. Team Constraints
- Purse validation
- Squad size validation

## 7. Trading System
- Player + cash trades
- Validation before execution

## 8. Realtime System
- Supabase channels per room
- Events: NEW_BID, PLAYER_SOLD, etc.

## 9. Emoji System
- Broadcast emoji reactions

## 10. Scoring System
- Use free cricket API or static dataset

## 11. Excel Upload
- Upload players and teams
- Parse using papaparse/xlsx

## 12. Database Tables
- users
- rooms
- teams
- players
- auction_state
- bids
- squad
- trades

## 13. Core Logic
- Server-side bid validation
- Timer-based player sell/unsold logic

## 14. React Structure
- Pages: login, lobby, room, auction, results
- Components: PlayerCard, BidPanel, TimerBar, etc.

## 15. Build Order
1. Auth
2. Room system
3. Player upload
4. Auction engine
5. Realtime bidding
6. Trading
7. Scoring

## 16. Key Decisions
- Server authoritative logic
- Supabase Realtime
- DB as source of truth

## 17. Summary
Real-time IPL auction simulator with trading and scoring system.
