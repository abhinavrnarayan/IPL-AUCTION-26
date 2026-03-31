"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

import { formatCurrencyShort, formatIncrement, parseAmountInput, toErrorMessage } from "@/lib/utils";

type ChatMessage = { role: "user" | "bot"; text: string };

type AiResponse =
  | { type: "navigation"; route?: string; target?: string; message?: string }
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
  | { type: "info"; message: string }
  | { error?: string };

export type AuctionAssistantContext = {
  roomCode: string;
  phase: string;
  currentPlayerName: string | null;
  currentBid: number | null;
  basePrice: number | null;
  currentLeadingTeamName: string | null;
  allowedIncrements: number[];
  recommendedIncrement: number | null;
  canOpenBid: boolean;
  isBiddingOpen: boolean;
};

export type AiAuctionCommand =
  | { type: "highlight-best-bid" }
  | { type: "place-bid"; amount: number; amountText: string };

export type AiAuctionResponse = {
  ok: boolean;
  message: string;
  highlightedIncrement?: number | null;
};

declare global {
  interface Window {
    __SFL_AUCTION_CONTEXT__?: AuctionAssistantContext;
  }
}

function getCurrentRoomCode(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "room" || parts[0] === "auction" || parts[0] === "results") {
    return parts[1] ?? null;
  }
  return null;
}

function getAuctionContext() {
  if (typeof window === "undefined") return null;
  return window.__SFL_AUCTION_CONTEXT__ ?? null;
}

function waitForAuctionResponse(command: AiAuctionCommand) {
  return new Promise<AiAuctionResponse>((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("sfl-ai-auction-response", onResponse as EventListener);
      resolve({ ok: false, message: "The auction did not respond. Try again." });
    }, 10000);

    const onResponse = (event: Event) => {
      window.clearTimeout(timeout);
      window.removeEventListener("sfl-ai-auction-response", onResponse as EventListener);
      resolve((event as CustomEvent<AiAuctionResponse>).detail);
    };

    window.addEventListener("sfl-ai-auction-response", onResponse as EventListener, {
      once: true,
    });
    window.dispatchEvent(
      new CustomEvent<AiAuctionCommand>("sfl-ai-auction-command", { detail: command }),
    );
  });
}

export default function AuctionAIWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loading, messages]);

  function pushBotMessage(text: string) {
    setMessages((prev) => [...prev, { role: "bot", text }]);
  }

  async function handleStartAuction() {
    const roomCode = getCurrentRoomCode(pathname);
    if (!roomCode || !pathname.startsWith("/room/")) {
      pushBotMessage("Open a room first, then I can start the auction.");
      return;
    }

    try {
      pushBotMessage("Starting the auction...");
      const response = await fetch(`/api/rooms/${roomCode}/auction/start`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not start the auction.");
      }
      router.push(`/auction/${roomCode}`);
    } catch (error) {
      pushBotMessage(toErrorMessage(error));
    }
  }

  async function handleBidCommand(amountText: string) {
    if (!pathname.startsWith("/auction/")) {
      pushBotMessage("Go to the auction page first, then I can place the bid.");
      return;
    }

    const context = getAuctionContext();
    if (!context) {
      pushBotMessage("Auction controls are not ready yet. Try again in a second.");
      return;
    }

    try {
      const amount = parseAmountInput(amountText);
      const response = await waitForAuctionResponse({
        type: "place-bid",
        amount,
        amountText,
      });
      pushBotMessage(response.message);
    } catch (error) {
      pushBotMessage(toErrorMessage(error));
    }
  }

  async function handleBidHelp() {
    if (!pathname.startsWith("/auction/")) {
      pushBotMessage("Go to the auction page to see live bid options.");
      return;
    }

    const context = getAuctionContext();
    if (!context) {
      pushBotMessage("Auction info is still loading.");
      return;
    }

    await waitForAuctionResponse({ type: "highlight-best-bid" });

    const leader = context.currentLeadingTeamName ?? "No team yet";
    const bestOption =
      context.currentBid === null
        ? context.canOpenBid && context.basePrice !== null
          ? `Best option: open at ${formatCurrencyShort(context.basePrice)}`
          : "No opening bid is available right now."
        : context.recommendedIncrement !== null
          ? `Best option: +${formatIncrement(context.recommendedIncrement)}`
          : "No valid next increment is available right now.";

    const options =
      context.currentBid === null
        ? context.basePrice !== null
          ? `Open bid: ${formatCurrencyShort(context.basePrice)}`
          : "No current player"
        : context.allowedIncrements.length > 0
          ? `Bid options: ${context.allowedIncrements.map((value) => `+${formatIncrement(value)}`).join(", ")}`
          : "No bid options";

    pushBotMessage(
      `${context.currentPlayerName ?? "No player on the block"} | Leading team: ${leader} | ${bestOption} | ${options}`,
    );
  }

  function handleLeadingTeam() {
    const context = getAuctionContext();
    if (!pathname.startsWith("/auction/") || !context) {
      pushBotMessage("Open the auction page to see the current leader.");
      return;
    }

    if (context.currentLeadingTeamName) {
      pushBotMessage(
        `${context.currentLeadingTeamName} is leading${context.currentBid !== null ? ` at ${formatCurrencyShort(context.currentBid)}` : ""}.`,
      );
      return;
    }

    pushBotMessage("No team is leading yet.");
  }

  const sendMessage = async () => {
    const userMessage = message.trim();
    if (!userMessage) return;

    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setMessage("");
    setLoading(true);

    try {
      const currentRoom = getCurrentRoomCode(pathname);
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, roomCode: currentRoom }),
      });
      const data = (await response.json()) as AiResponse;

      if ("error" in data && data.error) {
        pushBotMessage(data.error);
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "join_room" && data.room_code) {
        pushBotMessage(`Joining room ${data.room_code}...`);
        router.push(`/room/${data.room_code}`);
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "create_room") {
        pushBotMessage("Creating a new room...");
        const createResponse = await fetch("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "New Room",
            purse: 1000,
            squadSize: 11,
            timerSeconds: 30,
            bidIncrement: 10,
          }),
        });
        const result = (await createResponse.json()) as {
          room?: { code?: string };
          error?: string;
        };
        const roomCode = result.room?.code;
        if (!roomCode) {
          pushBotMessage(result.error ?? "Room creation failed.");
          return;
        }
        pushBotMessage(`Room created: ${roomCode}`);
        router.push(`/room/${roomCode}`);
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "start_auction") {
        await handleStartAuction();
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "auction_bid" && data.amount_text) {
        await handleBidCommand(data.amount_text);
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "show_bid_options") {
        await handleBidHelp();
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "show_leading_team") {
        handleLeadingTeam();
        return;
      }

      if ("type" in data && data.type === "action" && data.action === "seed_default_players") {
        const currentRoom = getCurrentRoomCode(pathname);
        if (!currentRoom) {
          pushBotMessage("You need to be inside a room for me to upload players. Open a room first!");
          return;
        }
        pushBotMessage("⏳ Seeding the default player pool and teams into this room... hang tight!");
        const seedRes = await fetch(`/api/rooms/${currentRoom}/ai/seed`, { method: "POST" });
        const seedData = (await seedRes.json()) as { ok?: boolean; playersImported?: number; teamsImported?: number; error?: string };
        if (!seedRes.ok || seedData.error) {
          pushBotMessage(`Failed to seed: ${seedData.error ?? "Unknown error"}. Make sure you are the room admin.`);
        } else {
          pushBotMessage(`✅ Done! Imported ${seedData.teamsImported ?? 10} teams and ${seedData.playersImported ?? 0} players into the room. You can now start the auction!`);
        }
        return;
      }

      if ("type" in data && data.type === "navigation" && data.target === "auction") {
        if (pathname === "/login") {
          pushBotMessage("Please sign in and join a room first.");
          return;
        }

        if (pathname === "/lobby") {
          pushBotMessage("Join or create a room first, then I can open the auction.");
          return;
        }

        if (pathname.startsWith("/room/")) {
          const roomCode = getCurrentRoomCode(pathname);
          if (roomCode) {
            pushBotMessage("Taking you to the auction...");
            router.push(`/auction/${roomCode}`);
            return;
          }
        }

        if (pathname.startsWith("/auction/")) {
          pushBotMessage("You are already on the auction page.");
          return;
        }
      }

      if ("type" in data && data.type === "navigation" && data.target === "results") {
        const roomCode = getCurrentRoomCode(pathname);
        if (roomCode) {
          pushBotMessage("Taking you to the results dashboard...");
          router.push(`/results/${roomCode}`);
          return;
        }
        pushBotMessage("Open a room first to view its results.");
        return;
      }

      if ("type" in data && data.type === "navigation" && data.route) {
        if (data.message) {
          pushBotMessage(data.message);
        } else {
          const routeName = (data.route.replace(/^\//, '') || "home").replace('-', ' ');
          pushBotMessage(`Taking you to ${routeName === 'lobby' ? 'the lobby' : routeName}`);
        }
        router.push(data.route);
        return;
      }

      if ("type" in data && data.type === "info") {
        pushBotMessage(data.message);
      }
    } catch (error) {
      pushBotMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 50 }}>
        <motion.button
          className="sfl-chatbot-pulse"
          whileHover={{ scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setOpen((value) => !value)}
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)",
            border: "2px solid rgba(165, 180, 252, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.6), inset 0 2px 10px rgba(255,255,255,0.2)",
            overflow: "hidden"
          }}
          type="button"
        >
          <Image src="/images/sfl.png" alt="Rocky AI" width={42} height={42} style={{ objectFit: 'contain', filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" }} />
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="sfl-chatbot-window"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              position: "fixed",
              bottom: "106px",
              right: "24px",
              width: "360px",
              maxWidth: "calc(100vw - 48px)",
              height: "500px",
              maxHeight: "calc(100dvh - 140px)",
              background: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "16px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              zIndex: 50,
            }}
          >
            {/* Header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "10px", background: "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)" }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px #10b981' }} />
              <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-display, inherit)', letterSpacing: '0.5px' }}>Rocky (SFL Bot)</span>
              
              <button 
                onClick={() => setOpen(false)}
                style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div
              ref={containerRef}
              className="sfl-chat-scroll"
              style={{ flex: 1, padding: "16px", overflowY: "auto", display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {messages.length === 0 && (
                <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5 }}>
                  <Image src="/images/sfl.png" alt="Logo" width={48} height={48} style={{ opacity: 0.5, marginBottom: '12px' }} />
                  <p style={{ color: '#fff', fontSize: '13px' }}>How can I help with tracking the auction?</p>
                </div>
              )}
              <AnimatePresence>
                {messages.map((chatMessage, index) => (
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", damping: 20, stiffness: 400 }}
                    key={`${chatMessage.role}-${index}`}
                    style={{
                      alignSelf: chatMessage.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: chatMessage.role === "user" ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                        background: chatMessage.role === "user" ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "rgba(255,255,255,0.08)",
                        border: chatMessage.role === "user" ? "none" : "1px solid rgba(255,255,255,0.1)",
                        color: "white",
                        fontSize: "14px",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      }}
                    >
                      {chatMessage.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ alignSelf: "flex-start" }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px 14px 14px 2px",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: "14px",
                      display: "flex",
                      gap: "6px",
                      alignItems: "center"
                    }}
                  >
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} style={{ width: 5, height: 5, background: "currentColor", borderRadius: "50%" }} />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.15 }} style={{ width: 5, height: 5, background: "currentColor", borderRadius: "50%" }} />
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.3 }} style={{ width: 5, height: 5, background: "currentColor", borderRadius: "50%" }} />
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} style={{ height: 1 }} />
            </div>

            <AnimatePresence>
              {showScrollButton && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                  style={{
                    position: "absolute",
                    right: "16px",
                    bottom: "76px",
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(15,23,42,0.9)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    zIndex: 10
                  }}
                  type="button"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                </motion.button>
              )}
            </AnimatePresence>

            <div style={{ padding: "14px", borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void sendMessage();
                    }
                  }}
                  placeholder="Ask Rocky..."
                  style={{
                    width: "100%",
                    padding: "14px 44px 14px 18px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(15,23,42,0.5)",
                    color: "white",
                    fontSize: "14px",
                    outline: "none",
                    boxShadow: "inset 0 2px 5px rgba(0,0,0,0.2)",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  }}
                  onFocus={(e) => {
                     e.target.style.borderColor = "rgba(99,102,241,0.6)";
                     e.target.style.background = "rgba(15,23,42,0.8)";
                     e.target.style.boxShadow = "inset 0 2px 5px rgba(0,0,0,0.2), 0 0 0 3px rgba(99,102,241,0.15)";
                  }}
                  onBlur={(e) => {
                     e.target.style.borderColor = "rgba(255,255,255,0.1)";
                     e.target.style.background = "rgba(15,23,42,0.5)";
                     e.target.style.boxShadow = "inset 0 2px 5px rgba(0,0,0,0.2)";
                  }}
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={sendMessage}
                  disabled={!message.trim() || loading}
                  style={{
                    position: "absolute",
                    right: "6px",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: message.trim() ? "#6366f1" : "transparent",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: message.trim() ? "white" : "rgba(255,255,255,0.3)",
                    cursor: message.trim() ? "pointer" : "default",
                    transition: "all 0.2s"
                  }}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes premium-pulse {
          0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.6), 0 10px 30px rgba(0,0,0,0.6); }
          70% { box-shadow: 0 0 0 22px rgba(99, 102, 241, 0), 0 10px 30px rgba(0,0,0,0.6); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0), 0 10px 30px rgba(0,0,0,0.6); }
        }
        .sfl-chatbot-pulse {
          animation: premium-pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .sfl-chat-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .sfl-chat-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .sfl-chat-scroll::-webkit-scrollbar-thumb {
          background-color: rgba(99, 102, 241, 0.4);
          border-radius: 10px;
        }
        .sfl-chat-scroll::-webkit-scrollbar-thumb:hover {
          background-color: rgba(99, 102, 241, 0.8);
        }
      `}</style>
    </>
  );
}
