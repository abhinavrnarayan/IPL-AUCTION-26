import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findRoomByCode, getRoomEntities } from "@/lib/server/room";
import { buildTeamLeaderboard } from "@/lib/domain/scoring";

type AiResponse =
  | { type: "navigation"; route?: string; target?: string }
  | {
      type: "action";
      action:
        | "join_room"
        | "create_room"
        | "show_bid_options"
        | "auction_bid"
        | "start_auction"
        | "seed_default_players"
        | "show_leading_team";
      room_code?: string;
      amount_text?: string;
    }
  | { type: "info"; message: string };

function parseDirectCommand(input: string): AiResponse | null {
  const message = input.trim();
  const lower = message.toLowerCase();

  const joinRoom = message.match(/\b(?:join|go\s*to|take\s*me\s*to|open)\s+(?:room\s+)?([a-z0-9]{5,8})\b/i);
  if (joinRoom && !/\b(?:results|dashboard|lobby|login|auction)\b/i.test(joinRoom[1])) {
    return {
      type: "action",
      action: "join_room",
      room_code: joinRoom[1]?.toUpperCase(),
    };
  }

  if (
    /\b(create|make|start)\s+(a\s+)?room\b/i.test(lower) ||
    /\bnew room\b/i.test(lower)
  ) {
    return { type: "action", action: "create_room" };
  }

  if (/\b(start|open)\s+auction\b/i.test(lower) || /\bstart auction again\b/i.test(lower)) {
    return { type: "action", action: "start_auction" };
  }

  if (
    /\b(best bid|best option|show bid options|show bids|what can i bid|what should i bid)\b/i.test(
      lower,
    )
  ) {
    return { type: "action", action: "show_bid_options" };
  }

  if (/\b(who is leading|leading team|current leader)\b/i.test(lower)) {
    return { type: "action", action: "show_leading_team" };
  }

  const bidMatch = message.match(
    /\bbid\s+([0-9]+(?:\.[0-9]+)?\s*(?:cr|crore|crores|l|lac|lakh|lakhs|k|thousand)?)\b/i,
  );
  if (bidMatch) {
    return {
      type: "action",
      action: "auction_bid",
      amount_text: bidMatch[1]?.replace(/\s+/g, ""),
    };
  }

  if (/\b(go to|take me to|open)\s+auction\b/i.test(lower)) {
    return { type: "navigation", target: "auction" };
  }

  if (/\b(go to|take me to|open)\s+lobby\b/i.test(lower)) {
    return { type: "navigation", route: "/lobby" };
  }

  if (/\b(go to|take me to|open)\s+login\b/i.test(lower)) {
    return { type: "navigation", route: "/login" };
  }

  if (/\b(go to|take me to|open|show)\s+(results|dashboard)\b/i.test(lower)) {
    return { type: "navigation", target: "results" };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { message, roomCode } = (await req.json()) as { message?: string; roomCode?: string };
    const trimmed = message?.trim();

    if (!trimmed) {
      return NextResponse.json(
        { type: "info", message: "Ask me to join a room, open auction, or place a bid." },
        { status: 400 },
      );
    }

    const direct = parseDirectCommand(trimmed);
    if (direct) {
      return NextResponse.json(direct);
    }

    let roomContext = "";
    let dataRule = "";

    if (roomCode) {
      try {
        const room = await findRoomByCode(roomCode);
        const { players, teams, squads } = await getRoomEntities(room.id);
        const leaderboard = buildTeamLeaderboard(teams, squads, players);

        const teamStrs = leaderboard.map(l => `${l.teamName}: ${l.totalPoints} pts, ${l.remainingPurse} purse remaining, ${l.squadCount} players`).join("\n");
        let playerStrs = players.map(p => {
          const squad = squads.find(s => s.playerId === p.id);
          const team = squad ? teams.find(t => t.id === squad.teamId) : null;
          return `${p.name} (${p.role}): Base ${p.basePrice}L. ${squad ? `Sold to ${team?.name} for ${squad.purchasePrice}L in Round ${squad.acquiredInRound}` : p.status}`;
        }).join("\n");

        if (playerStrs.length > 10000) {
           const queryWords = trimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);
           const matchedPlayers = players.filter(p => queryWords.some(w => p.name.toLowerCase().includes(w)));
           const soldPlayers = players.filter(p => p.status === "SOLD");
           
           const combined = Array.from(new Set([...matchedPlayers, ...soldPlayers, ...players]));
           
           playerStrs = combined.slice(0, 100).map(p => {
             const squad = squads.find(s => s.playerId === p.id);
             const team = squad ? teams.find(t => t.id === squad.teamId) : null;
             return `${p.name} (${p.role}): Base ${p.basePrice}L. ${squad ? `Sold to ${team?.name} for ${squad.purchasePrice}L` : p.status}`;
           }).join("\n") + "\n(Some players truncated due to context size)";
        }

        roomContext = `\n\n[LIVE ROOM DATA FOR ROOM ${roomCode} - USE THIS TO ANSWER QUESTIONS ABOUT PLAYERS AND TEAMS]:\nTeams & Scoreboard:\n${teamStrs}\n\nPlayers Registry:\n${playerStrs}`;
        dataRule = `\nCRITICAL RULE: I am providing you with LIVE ROOM DATA at the bottom of this prompt. Whenever the user asks a question about a player, a team, the scoreboard, or who bought someone, YOU MUST ONLY use the LIVE ROOM DATA below to answer. Do NOT use your pre-trained real-world IPL knowledge. If the data says a player is unsold, tell them they are unsold. Reply with the answer inside an "info" response type.`;
      } catch (err) {
        console.error("Failed to load room context for AI", err);
      }
    } else {
      try {
        const admin = getSupabaseAdminClient();
        const { data: openRooms } = await admin.from("rooms").select("name, code, status").neq("status", "COMPLETED").order("created_at", { ascending: false }).limit(10);
        if (openRooms && openRooms.length > 0) {
          const roomText = openRooms.map(r => `- Room Code: ${r.code} (Name: ${r.name}, Status: ${r.status})`).join("\n");
          roomContext = `\n[LOBBY DATA]: The user is currently in the Lobby. Below is a list of active open rooms they can join:\n${roomText}\nCRITICAL RULE: If the user asks to "join a room", specifically ask them which room they want to join and list the available rooms to them.`;
        } else {
          roomContext = `\n[LOBBY DATA]: The user is currently in the Lobby. There are NO active rooms right now.\nCRITICAL RULE: If they ask about joining a room, tell them none exist right now and instruct them to create a new room.`;
        }
      } catch (err) {}
    }

    const identityPrompt = `
You are "Rocky", the SFL cricket bot for a fantasy IPL auction app.
When asked who you are, reply that you are Rocky, the SFL cricket bot.
When asked who made you, reply that you were made by SFL cricket league developers.
For technical or coding questions, say you are Rocky, an SFL cricket bot and not a personal assistant.
If the user makes casual conversation (e.g., "how are you", "hi", "how is your day"), reply naturally and friendly as Rocky using the "info" response type.
${dataRule}
`;

    const formatConstraints = `
CRITICAL FORMATTING RULES:
Output ONLY valid JSON.
No markdown.
No explanation.

Valid shapes:
{ "type": "navigation", "route": string, "target"?: string }
{ "type": "action", "action": string, "room_code"?: string, "amount_text"?: string }
{ "type": "info", "message": string }

Supported actions:
- join_room
- create_room
- show_bid_options
- auction_bid
- start_auction
- seed_default_players
- show_leading_team

CRITICAL SAFETY RULE: NEVER invent or hallucinate pages that don't exist. If the user asks you to go to a page or do something completely outside your knowledge or off-topic, DO NOT output a navigation block. Instead, output: { "type": "info", "message": "I don't know..." }

If the user asks "how to join an auction", "how to play", or "how to start":
{ "type": "navigation", "route": "/login", "message": "To join an auction, please log in first, create a team, and then you can join or start an auction room! I'll take you to the login page right now." }

If the user asks to "start the auction" or "how to start" or "what do I do first":
{ "type": "info", "message": "To start an auction, you first need players and teams in the room! Just say \"upload players\" and I'll load the full default IPL player pool for you automatically. Then say \"create teams\" to set up the teams!" }

If the user says "upload players" or "seed players" or "upload default players" or "load players":
{ "type": "action", "action": "seed_default_players" }

If the user says "create teams" or "make teams" or "add teams" or "setup teams":
{ "type": "navigation", "route": "/room/{{roomCode}}", "message": "Head to the room setup page and use the Team upload section to add your teams! You can add team names there easily." }
`;

    const finalSystemPrompt = `${identityPrompt}\n${roomContext}\n${formatConstraints}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: trimmed },
        ],
        temperature: 0.2,
      }),
    });

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content ?? "";
    const cleanContent = rawContent.replace(/```json/i, "").replace(/```/g, "").trim();

    try {
      return NextResponse.json(JSON.parse(cleanContent));
    } catch {
      // LLM sometimes wraps response in a JSON string instead of pure JSON.
      // Try to extract the message field to avoid showing raw { } to the user.
      const msgMatch = cleanContent.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
      if (msgMatch) {
        return NextResponse.json({ type: "info", message: msgMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') });
      }
      return NextResponse.json({ type: "info", message: cleanContent || "I could not understand that." });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
