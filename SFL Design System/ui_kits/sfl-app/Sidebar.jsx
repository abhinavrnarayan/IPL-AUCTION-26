// Sidebar.jsx — SFL sidebar (sport/league nav + profile)
const NAV = [
  { sport: "Cricket", icon: "🏏", id: "cricket", leagues: [
    { label: "IPL 2026", slug: "ipl" },
    { label: "T20 Internationals", soon: true },
    { label: "ODI", soon: true },
  ]},
  { sport: "Football", icon: "⚽", id: "football", leagues: [
    { label: "ISL", soon: true },
    { label: "EPL", soon: true },
  ]},
];

function Sidebar({ activeLeague, onNavigate }) {
  const [open, setOpen] = React.useState({ cricket: true, football: false });
  const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="./sfl-logo.png" alt="SFL"/>
        <span className="sidebar-brand-text">SFL</span>
      </div>
      <div className="sidebar-section-label">Sports</div>
      <nav style={{display:"flex", flexDirection:"column", gap:2}}>
        {NAV.map(g => (
          <div className="sport-group" key={g.id}>
            <button className="sport-header" onClick={() => toggle(g.id)}>
              <span className="icon">{g.icon}</span>
              <span>{g.sport}</span>
              <span className={"chev" + (open[g.id] ? " open" : "")}>›</span>
            </button>
            {open[g.id] && (
              <ul className="league-list">
                {g.leagues.map(l => l.soon ? (
                  <li key={l.label} className="league-item soon">
                    <span className="dot"/>{l.label}<span className="soon-badge">Soon</span>
                  </li>
                ) : (
                  <li key={l.label} className={"league-item" + (activeLeague === l.slug ? " active" : "")} onClick={() => onNavigate(l.slug)}>
                    <span className="dot"/>{l.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="profile-btn">
          <span className="avatar">AK</span>
          <span className="profile-info">
            <span className="profile-name">Akash K</span>
            <span className="profile-email">akash@snt-thomas.edu</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;
