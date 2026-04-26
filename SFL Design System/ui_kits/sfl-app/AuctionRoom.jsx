// AuctionRoom.jsx — the centrepiece of SFL
const TEAMS = [
  { id: "t1", name: "Chennai Challengers", code: "CSK", purse: 82_500_000, color: "#f59e0b" },
  { id: "t2", name: "Mumbai Mavericks", code: "MI", purse: 65_000_000, color: "#6366f1" },
  { id: "t3", name: "Bangalore Bullets", code: "RCB", purse: 118_000_000, color: "#c9182b" },
  { id: "t4", name: "Delhi Dynamos", code: "DC", purse: 94_500_000, color: "#3b82f6" },
];

const PLAYERS = [
  { id: "p1", name: "Jasprit Bumrah", role: "Bowler", nat: "India", franchise: "Mumbai Indians", base: 20_000_000, status: "ON_BLOCK" },
];

const SOLD = [
  { id: "s1", name: "Virat Kohli", team: "RCB", teamName: "Royal Challengers", price: 185_000_000, role: "Batter" },
  { id: "s2", name: "Rohit Sharma", team: "MI", teamName: "Mumbai Indians", price: 165_000_000, role: "Batter" },
  { id: "s3", name: "MS Dhoni", team: "CSK", teamName: "Chennai Super Kings", price: 155_000_000, role: "Wicket-keeper" },
  { id: "s4", name: "Hardik Pandya", team: "MI", teamName: "Mumbai Indians", price: 140_000_000, role: "All-rounder" },
  { id: "s5", name: "Rishabh Pant", team: "DC", teamName: "Delhi Capitals", price: 125_000_000, role: "Wicket-keeper" },
  { id: "s6", name: "KL Rahul", team: "LSG", teamName: "Lucknow Super Giants", price: 110_000_000, role: "Batter" },
];

const INCREMENTS = [2_500_000, 5_000_000, 10_000_000];

function fmtShort(n) {
  if (n >= 1e7) return `₹${(n/1e7).toFixed(n % 1e7 === 0 ? 0 : 1)} Cr`;
  return `₹${(n/1e5).toFixed(0)} L`;
}

function TimerBar({ seconds, total }) {
  const pct = Math.max(0, Math.min(100, (seconds / total) * 100));
  const urgency = seconds <= 3 ? "critical" : seconds <= 10 ? "warning" : "normal";
  const fill = urgency === "critical" ? "linear-gradient(90deg,#f43f5e,#fb7185)" :
               urgency === "warning" ? "linear-gradient(90deg,#f59e0b,#fbbf24)" :
               "linear-gradient(90deg,#6366f1,#818cf8)";
  const glow = urgency === "critical" ? "0 0 14px rgba(244,63,94,0.6)" :
               urgency === "warning" ? "0 0 10px rgba(245,158,11,0.45)" : "none";
  return (
    <div>
      <div className="timer-track">
        <div className={"timer-fill" + (urgency === "critical" ? " critical" : "")} style={{width: pct + "%", background: fill, boxShadow: glow}}/>
      </div>
      <div className="timer-meta">
        <span>Live timer</span>
        <strong style={{color: urgency === "critical" ? "var(--danger)" : urgency === "warning" ? "var(--warning)" : undefined}}>{seconds}s</strong>
      </div>
    </div>
  );
}

function PlayerCard({ player, bid, leadingTeam }) {
  return (
    <div className="player-card">
      <div className="header-row">
        <div>
          <span className="eyebrow">On the block</span>
          <h2>{player.name}</h2>
          <div className="subtle" style={{fontSize:13, marginTop:2}}>{player.franchise}</div>
        </div>
        <div className="pill-row">
          <span className="pill">{player.role}</span>
          <span className="pill">{player.nat}</span>
          <span className="pill highlight">Base {fmtShort(player.base)}</span>
        </div>
      </div>
      <div className="stats-strip" style={{marginTop:18}}>
        <div className="stat-tile"><strong>{fmtShort(bid ?? player.base)}</strong>Current bid</div>
        <div className="stat-tile"><strong>{leadingTeam?.code ?? "Open"}</strong>{leadingTeam?.name ?? "No bid yet"}</div>
        <div className="stat-tile"><strong>AVAILABLE</strong>Status</div>
      </div>
    </div>
  );
}

function BidPanel({ teams, currentBid, leadingTeamId, onBid, bidOpen }) {
  return (
    <div className="panel">
      <h2>Bid panel</h2>
      <div className="subtle" style={{fontSize:13, marginBottom:12}}>
        {currentBid !== null ? (<>Leading: <strong style={{color:"var(--fg1)"}}>{fmtShort(currentBid)}</strong></>) : "No bids yet — open at base price"}
        <span className="pill" style={{marginLeft:10}}>Admin control</span>
      </div>
      <div className="grid two" style={{gap:10}}>
        {teams.map(t => {
          const leading = leadingTeamId === t.id;
          return (
            <div key={t.id} className="room-card" style={{border: leading ? "2px solid var(--leading)" : undefined, cursor:"default"}}>
              <div className="header-row" style={{alignItems:"center"}}>
                <div>
                  <strong>{t.name}</strong>
                  <div className="subtle mono" style={{fontSize:12}}>{t.code}</div>
                </div>
                {leading && <span className="pill success">Leading</span>}
              </div>
              <div className="subtle" style={{fontSize:12, marginTop:4}}>Purse: {fmtShort(t.purse)}</div>
              <div style={{display:"flex", gap:6, marginTop:10, flexWrap:"wrap"}}>
                {INCREMENTS.map((inc, i) => (
                  <button key={inc} className={"bid-btn" + (i === 1 ? " highlighted" : "")}
                    disabled={!bidOpen || leading || t.purse < (currentBid ?? 0) + inc}
                    onClick={() => onBid(t.id, inc)}>
                    +{fmtShort(inc)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatPanel({ messages, onSend }) {
  const [text, setText] = React.useState("");
  const emojis = ["🔥","👏","😮","😂","💸","🏏"];
  return (
    <div className="panel chat">
      <h2>Room chat</h2>
      <div className="subtle" style={{fontSize:12, marginBottom:8}}>Live messages and emoji reactions</div>
      <div className="emoji-row">
        {emojis.map(e => <button key={e} className="emoji-btn" onClick={() => onSend("emoji", e)}>{e}</button>)}
      </div>
      <div className="chat-log">
        {messages.length === 0 ? (
          <div className="empty-state" style={{fontSize:12}}>Start the chat. Messages and emoji reactions will appear here live.</div>
        ) : messages.map(m => (
          <div key={m.id} className={"chat-msg" + (m.own ? " own" : "")}>
            <div className="chat-meta">
              <strong>{m.user}</strong>
              {m.tag && <span className="pill" style={{fontSize:10, padding:"1px 6px"}}>{m.tag}</span>}
            </div>
            <div className={"chat-text" + (m.kind === "emoji" ? " emoji" : "")}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="composer">
        <input className="input" placeholder="Type a message..." value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && text.trim()) { onSend("text", text); setText(""); } }}/>
        <button className="button secondary" disabled={!text.trim()} onClick={() => { onSend("text", text); setText(""); }}>Send</button>
      </div>
    </div>
  );
}

function SoldTicker({ items }) {
  return (
    <div className="panel">
      <div className="header-row" style={{marginBottom:10}}>
        <h3>Recently sold</h3>
        <span className="subtle" style={{fontSize:12}}>Highest prices first</span>
      </div>
      <div className="sold-row">
        {items.map(s => (
          <div key={s.id} className="sold-item">
            <span className="sold-badge">SOLD</span>
            <strong>{s.name}</strong>
            <span className="subtle" style={{fontSize:11}}>{s.team} · {s.role}</span>
            <span className="sold-price">{fmtShort(s.price)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SquadBoard({ teams, squads }) {
  const [expanded, setExpanded] = React.useState("t1");
  return (
    <div className="panel">
      <h2>Squads</h2>
      <div className="card-list">
        {teams.map(t => {
          const entries = squads.filter(s => s.teamId === t.id);
          const isOpen = expanded === t.id;
          return (
            <div key={t.id} className="squad-team">
              <button className="squad-team-head" onClick={() => setExpanded(isOpen ? null : t.id)}>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <span className="squad-shortcode" style={{background: t.color}}>{t.code}</span>
                  <span style={{fontWeight:600, fontSize:14}}>{t.name}</span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap:10}}>
                  <span className="subtle" style={{fontSize:11}}>{entries.length}/18</span>
                  <span className="squad-purse">{fmtShort(t.purse)}</span>
                  <span className="subtle" style={{transform: isOpen ? "rotate(180deg)" : "", transition:"transform 0.15s"}}>▾</span>
                </div>
              </button>
              {isOpen && (
                <div className="squad-body">
                  {entries.length === 0 ? <div className="subtle" style={{fontSize:12, padding:"8px 0", fontStyle:"italic"}}>No players purchased yet.</div> :
                    entries.map(e => (
                      <div key={e.id} className="squad-player">
                        <strong>{e.name}</strong>
                        <span className="squad-role">{e.role}</span>
                        <span className="squad-price">{fmtShort(e.price)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AuctionRoom() {
  const [timer, setTimer] = React.useState(14);
  const [bid, setBid] = React.useState(185_000_000);
  const [leading, setLeading] = React.useState("t3");
  const [messages, setMessages] = React.useState([
    { id: "m1", user: "Riya", tag: "MI", kind: "text", text: "Don't sleep on the death bowlers" },
    { id: "m2", user: "Akash", tag: "ADMIN", kind: "text", text: "Opening at base ₹2 Cr — 20s timer", own: true },
    { id: "m3", user: "Devika", tag: "CSK", kind: "emoji", text: "🔥" },
  ]);

  React.useEffect(() => {
    const i = setInterval(() => setTimer(t => t > 0 ? t - 1 : 20), 1000);
    return () => clearInterval(i);
  }, []);

  const squads = [
    { id: "sq1", teamId: "t1", name: "MS Dhoni", role: "Wicket-keeper", price: 155_000_000 },
    { id: "sq2", teamId: "t1", name: "Ruturaj Gaikwad", role: "Batter", price: 35_000_000 },
    { id: "sq3", teamId: "t2", name: "Rohit Sharma", role: "Batter", price: 165_000_000 },
    { id: "sq4", teamId: "t2", name: "Hardik Pandya", role: "All-rounder", price: 140_000_000 },
    { id: "sq5", teamId: "t3", name: "Virat Kohli", role: "Batter", price: 185_000_000 },
    { id: "sq6", teamId: "t4", name: "Rishabh Pant", role: "Wicket-keeper", price: 125_000_000 },
  ];

  const leadingTeam = TEAMS.find(t => t.id === leading);

  const handleBid = (teamId, inc) => {
    setBid(b => b + inc);
    setLeading(teamId);
    setTimer(20);
  };

  const handleSend = (kind, text) => {
    setMessages(m => [...m, { id: "m" + Date.now(), user: "You", tag: "CSK", kind, text, own: true }].slice(-20));
  };

  return (
    <div>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:16}}>
        <span className="eyebrow">Auction room · AB12CD · Round 3</span>
        <span className="pill success">LIVE</span>
      </div>
      <div className="grid" style={{gridTemplateColumns:"2fr 1fr", gap:16}}>
        <div className="grid" style={{gap:16}}>
          <PlayerCard player={PLAYERS[0]} bid={bid} leadingTeam={leadingTeam}/>
          <div className="panel">
            <TimerBar seconds={timer} total={20}/>
          </div>
          <BidPanel teams={TEAMS} currentBid={bid} leadingTeamId={leading} onBid={handleBid} bidOpen={timer > 0}/>
          <SoldTicker items={SOLD}/>
        </div>
        <div className="grid" style={{gap:16, alignContent:"start"}}>
          <ChatPanel messages={messages} onSend={handleSend}/>
          <SquadBoard teams={TEAMS} squads={squads}/>
        </div>
      </div>
    </div>
  );
}

window.AuctionRoom = AuctionRoom;
window.fmtShort = fmtShort;
