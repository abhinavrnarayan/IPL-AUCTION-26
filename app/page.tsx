import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="nav">
        <div className="brand"><SiteLogo suffix="Auction Platform" /></div>
        <div className="button-row">
          <Link className="button ghost" href="/login">
            Sign in
          </Link>
          <Link className="button" href="/lobby">
            Open lobby
          </Link>
        </div>
      </div>

      <section className="hero">
        <span className="eyebrow">PRD v2 foundation</span>
        <h1>Run a live SFL auction with room controls, trades, and scoring.</h1>
        <p className="subtle">
          This starter ships with Supabase auth, room setup, uploads, a
          server-validated auction engine, realtime subscriptions, emoji
          reactions, trade validation, and a results leaderboard.
        </p>
        <div className="stats-strip">
          <div className="stat-tile">
            <strong>Server authoritative</strong>
            Bids, timers, and trade checks run through API routes backed by the
            database.
          </div>
          <div className="stat-tile">
            <strong>Realtime rooms</strong>
            Supabase channels refresh auction state and carry emoji reactions per
            room.
          </div>
          <div className="stat-tile">
            <strong>Build-order aligned</strong>
            Auth, rooms, uploads, auction engine, trades, and scoring are
            scaffolded in the repo.
          </div>
        </div>
      </section>
    </main>
  );
}
