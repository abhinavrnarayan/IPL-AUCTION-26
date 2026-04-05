"use client";
import { getAllowedIncrements } from "@/lib/domain/auction";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function AIWidget() {
  const [open, setOpen] = useState(false);

  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState<
  { role: "user" | "bot"; text: string }[]
  >([]);

  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const router = useRouter();


  const isNearBottom = () => {
  const container = containerRef.current;
  if (!container) return true;

  const threshold = 100;
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <
    threshold
  );
};

  useEffect(() => {
  if (isNearBottom()) {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
  } else {
    setShowScrollButton(true);
  }
}, [messages, loading]);

  
  
  const sendMessage = async () => {
    if (!message) return;

    const userMessage = message;

    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setMessage("");
    
    setLoading(true);

    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();

    setLoading(false);


    if (data.type === "action") {
        if (data.action === "join_room") {
            setMessages((prev) => [
                ...prev,
                { role: "bot", text: `joining room ${data.room_code}` },
            ]);

            router.push(`/room/${data.room_code}`);
            return;
        }
    }

    if (data.type == "action") {
        if (data.action === "create_room") {
            setMessages((prev) => [
                ...prev,
                { role: "bot", text: "Creating a new room..."},
            ]);

            const res = await fetch("/api/rooms", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: "New Room",
                    purse: 1000,
                    squadSize: 11,
                    timerSeconds: 30,
                    bidIncrement: 10,
                }),
            });

            const result = await res.json();

            const roomCode = result.room?.code;

            setMessages((prev) => [
                ...prev,
                { role: "bot", text: `Room created: ${roomCode}` },
            ]);

            router.push(`/room/${roomCode}`);

            if (!roomCode) {
                setMessages((prev) => [
                    ...prev,
                    { role: "bot", text: "Room Creation Failed."},
                ]);
                return;
            }
            return;
        }
    }

    if (data.action === "show_bid_options") {
        const path = window.location.pathname;

        if (!path.startsWith("/auction/")) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text : "Go to auction page to place bid.",
                },
            ]);
            return;
        }

        setMessages((prev) => [
            ...prev,
            {
                role: "bot",
                text : "__SHOW_BID_OPTIONS__",
            },
        ]);
        return;
    }

    if (data.type === "navigation" && data.target === "auction") {
        const path = window.location.pathname;

        if (path === "/login") {
            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text : "Please login and join a room to access the bidding page.",
                },
            ]);
            return;
        }

        if (path === "/lobby") {
            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text: "You need to join or create a room before going to the bidding page.",
                },
            ]);
            return;
        }

        if (path.startsWith("/room/") && !path.includes("/auction")) {
            const roomCode = path.split("/")[2];

            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text: "Taking you to the bidding page...",
                },
            ]);

            router.push(`/auction/${roomCode}`);
            return;
        }

        if (path.includes("/auction")) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "bot",
                    text: "You are in the bidding page.",
                },
            ]);
            return;
        }
    }

    // handle navigation
    if (data.type === "navigation") {
        setMessages((prev) => [
            ...prev,
            { role: "bot", text: `Taking you to ${data.route}`},
        ]);
    router.push(data.route);
    return;
    }
    // handle info
    if (data.type === "info") {
        setMessages((prev) => 
        [
            ...prev,
            { role: "bot", text: data.message },
        ]);
    }
  };

  function BidOptionsInline() {
    const [options, setOptions] = useState<number[]>([]);

    useEffect(() => {
        async function fetchOptions() {
            const path = window.location.pathname;
            const roomCode = path.split("/")[2];

            try {
                const res = await fetch(`api/rooms/${roomCode}/auction/state`);
                const data = await res.json();

                const increments = getAllowedIncrements(data.currentBid);
                setOptions(increments);
            } catch(err) {
                console.error(err);
            }
            }

            fetchOptions();
        },
    []);

    const handleBid = async (inc: number) => {
        const path = window.location.pathname;
        const roomCode = path.split("/")[2];

        await fetch(`/api/rooms/${roomCode}/auction/bid`, {
            method: "POST",
            headers : {
                "Content-Type": "application/json",
            },
        });
    };

    return (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap"}}>
        {options.map((inc) => (
            <button
            key={inc}
            onClick={() => handleBid(inc)}
            style={{
                padding: "6px 10px",
                borderRadius: "8px",
                background: "#6366f1",
                color: "white",
                fontSize: "12px",
            }}
            >
                +{inc}
            </button>
        ))}
        </div>
    );
  }
  return (
    <>
      {/* Floating Button */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#6366f1",
          color: "white",
          padding: "12px 16px",
          borderRadius: "50%",
          cursor: "pointer",
        }}
      >
        AI
      </div>

      {/* Chat Box */}
      {open && (
  <div
    style={{
      position: "fixed",
      bottom: "80px",
      right: "20px",
      width: "300px",
      height: "400px",
      background: "white",
      borderRadius: "12px",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    }}
  >
    {/* Messages */}
    <div ref={containerRef} 
    style = {{ flex: 1, padding: "10px", overflow: "auto"}}>
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            marginBottom: "8px",
            textAlign: msg.role === "user" ? "right" : "left",
      }}
        >
            <span
             style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: "10px",
                background:
                msg.role === "user" ? "#6366f1" : "#e5e7eb",
                 color: msg.role === "user" ? "white" : "black",
             }}
             >
                {msg.text === "__SHOW_BID_OPTIONS__" ? (
                    <BidOptionsInline />
                ) : (
                    msg.text
                )}
             </span>
             </div>
      ))}
            {loading && (
                <div style={{ marginBottom: "8px", textAlign: "left"}}>
                <span
                 style={{
                    display: "inline-block",
                    padding: "6px 10px", 
                    borderRadius: "10px",
                    background: "#e5e7eb",
                 }}

                 >
                    <span>
                        <span className="dot">.</span>
                        <span className="dot">.</span>
                        <span className="dot">.</span>
                    </span>
                 </span>
                 </div>
            )}
            <div ref={messagesEndRef} />
    </div>

    {/* Scroll Button UI */}
    { showScrollButton && (
        <button 
        onClick={() =>
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth"})
        }
          className="absolute bottom-20 right-4 bg-blue-500 text-white px-3 py-1 rounded-full shadow"
        >
        ↓
        </button>
        )}

    {/* Input */}
    <div style={{ padding: "10px", borderTop: "1px solid #ddd" }}>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") sendMessage();
        }}
        placeholder="Ask something..."
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ccc",
        }}
      />
    </div>
  </div>
        )}
    </>
  );
}