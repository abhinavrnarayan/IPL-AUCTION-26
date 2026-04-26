// Lobby.jsx
const ROOMS = [
  { id: "r1", code: "AB12CD", name: "Premier Auction Room", purse: 1_500_000_000, squad: 18, timer: 20, members: 8, teams: 8, phase: "LIVE", isAdmin: true },
  { id: "r2", code: "QX99KR", name: "SNT Thomas · Batch '24", purse: 1_000_000_000, squad: 15, timer: 15, members: 6, teams: 6, phase: "COMPLETED", isAdmin: false },
  { id: "r3", code: "MZ14LL", name: "Dharavi Draft League", purse: 2_000_000_000, squad: 20, timer: 30, members: 10, teams: 10, phase: null, isAdmin: true },
];

function Lobby({ onOpen }) {
  return (
    <div className="grid" style={{gap:20}}>
      <section className="hero">
        <span className="eyebrow">Fantasy IPL auction game</span>
        <h1>Build your fantasy IPL team through live player auctions.</h1>
        <p className="subtle">SFL is a live fantasy auction platform. Create a private room, invite your group, bid on real players, manage your purse, and shape the squad you want. Points are scored based on real match performance after the season begins.</p>
      </section>
      <div className="grid two">
        <div className="panel">
          <h2>Create a room</h2>
          <div className="grid" style={{gap:10, gridTemplateColumns:"1fr 1fr"}}>
            <div className="field" style={{gridColumn:"1 / -1"}}>
              <label>Room name</label>
              <input className="input" defaultValue="Premier Auction Room"/>
            </div>
            <div className="field">
              <label>Purse</label>
              <select className="select"><option>₹100 Cr</option><option>₹150 Cr</option><option>₹200 Cr</option></select>
            </div>
            <div className="field">
              <label>Squad size</label>
              <input className="input" defaultValue="18" type="number"/>
            </div>
            <div className="field">
              <label>Bid timer</label>
              <select className="select"><option>10 seconds</option><option>20 seconds</option><option>30 seconds</option></select>
            </div>
          </div>
          <button className="button" style={{marginTop:14, width:"100%"}}>Create room</button>
        </div>
        <div className="panel">
          <h2>Join with a code</h2>
          <div className="field">
            <label>Room code</label>
            <input className="input mono" placeholder="AB12CD" maxLength="8"/>
          </div>
          <button className="button secondary" style={{marginTop:14, width:"100%"}}>Join room</button>
          <div className="notice" style={{marginTop:14}}>
            <strong>Tip:</strong> <span className="subtle">Ask your admin for the 6-letter room code.</span>
          </div>
        </div>
      </div>
      <div>
        <div className="header-row" style={{marginBottom:12}}>
          <h2>Your rooms</h2>
          <span className="subtle" style={{fontSize:13}}>{ROOMS.length} active</span>
        </div>
        <div className="grid three">
          {ROOMS.map(r => (
            <div key={r.id} className="room-card" onClick={() => onOpen(r)}>
              <div className="header-row">
                <div>
                  <strong>{r.name}</strong>
                  <div className="subtle mono" style={{fontSize:11, marginTop:2}}>{r.code}</div>
                </div>
                <div className="pill-row">
                  <span className="pill">{r.isAdmin ? "Admin" : "Member"}</span>
                  {r.phase === "COMPLETED" && <span className="pill highlight">Complete</span>}
                  {r.phase === "LIVE" && <span className="pill success">Live</span>}
                </div>
              </div>
              <div className="stats-strip" style={{marginTop:14}}>
                <div className="stat-tile"><strong>{r.members}</strong>Members</div>
                <div className="stat-tile"><strong>{r.teams}</strong>Teams</div>
                <div className="stat-tile"><strong>{r.squad}</strong>Squad</div>
                <div className="stat-tile"><strong>{r.timer}s</strong>Timer</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
window.Lobby = Lobby;
