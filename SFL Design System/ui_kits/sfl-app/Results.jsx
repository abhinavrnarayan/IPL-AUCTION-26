// Results.jsx — post-season leaderboard view
function Results() {
  const teams = [
    { rank: 1, code: "RCB", name: "Bangalore Bullets", points: 1284, purse: 52_000_000, squadCount: 17 },
    { rank: 2, code: "MI", name: "Mumbai Mavericks", points: 1156, purse: 18_000_000, squadCount: 18 },
    { rank: 3, code: "CSK", name: "Chennai Challengers", points: 1042, purse: 65_000_000, squadCount: 16 },
    { rank: 4, code: "DC", name: "Delhi Dynamos", points: 988, purse: 31_000_000, squadCount: 18 },
    { rank: 5, code: "KKR", name: "Kolkata Knights", points: 812, purse: 102_000_000, squadCount: 15 },
  ];
  const scorers = [
    { name: "Virat Kohli", team: "RCB", role: "Batter", pts: 312 },
    { name: "Jasprit Bumrah", team: "MI", role: "Bowler", pts: 298 },
    { name: "Hardik Pandya", team: "MI", role: "All-rounder", pts: 276 },
    { name: "MS Dhoni", team: "CSK", role: "Wicket-keeper", pts: 245 },
    { name: "Rishabh Pant", team: "DC", role: "Wicket-keeper", pts: 231 },
    { name: "KL Rahul", team: "KKR", role: "Batter", pts: 218 },
  ];
  return (
    <div className="grid" style={{gap:18}}>
      <section className="panel">
        <span className="eyebrow">Results centre</span>
        <h1 style={{fontFamily:"var(--font-display)", fontWeight:700, fontSize:"clamp(1.6rem,5vw,2.4rem)", letterSpacing:"-0.02em", margin:"6px 0 8px"}}>Premier Auction Room</h1>
        <p className="subtle" style={{fontSize:14, maxWidth:640}}>Follow the overall standings, top fantasy scorers, and each squad in a team-style leaderboard view.</p>
        <div className="stats-strip" style={{marginTop:16}}>
          <div className="stat-tile"><strong>5</strong>Teams ranked</div>
          <div className="stat-tile"><strong>84</strong>Players sold</div>
          <div className="stat-tile"><strong>3</strong>Trades executed</div>
          <div className="stat-tile"><strong>5,282</strong>Total points</div>
        </div>
      </section>
      <div className="grid two">
        <div className="panel">
          <div className="header-row" style={{marginBottom:12}}>
            <div><span className="eyebrow">General leaderboard</span><h2>Overall rankings</h2></div>
            <span className="pill highlight">Leader: Bangalore Bullets</span>
          </div>
          <div className="card-list">
            {teams.map(t => (
              <div key={t.code} className="leader-row">
                <div className={"rank-chip" + (t.rank === 1 ? " gold" : "")}>{t.rank === 1 ? "🏆" : "#"+t.rank}</div>
                <div>
                  <strong>{t.name}</strong>
                  <div className="subtle" style={{fontSize:11, marginTop:2}}>{t.code} · {t.squadCount} players</div>
                </div>
                <div className="leader-stat"><strong>{t.points.toLocaleString()}</strong><span>Points</span></div>
                <div className="leader-stat"><strong>{window.fmtShort(t.purse)}</strong><span>Purse left</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="header-row" style={{marginBottom:12}}>
            <div><span className="eyebrow">Top scorers</span><h2>Best players across teams</h2></div>
          </div>
          <div className="card-list">
            {scorers.map((s, i) => (
              <div key={s.name} className="leader-row" style={{gridTemplateColumns:"40px 1fr auto"}}>
                <div className="rank-chip" style={{width:30, height:30, fontSize:12}}>#{i+1}</div>
                <div>
                  <strong>{s.name}</strong>
                  <div className="subtle" style={{fontSize:11, marginTop:2}}>{s.team} · {s.role}</div>
                </div>
                <div className="leader-stat"><strong>{s.pts}</strong><span>pts</span></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
window.Results = Results;
