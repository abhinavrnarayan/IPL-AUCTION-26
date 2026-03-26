import Link from "next/link";
import { SiteLogo } from "@/components/site-logo";

export default function HomePage() {
  return (
    <main className="shell">
      <div className="nav">
        <div className="brand"><SiteLogo suffix="St. Thomas Fantasy League" /></div>
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
        <span className="eyebrow">Fantasy IPL Auction Game</span>
        <h1>Build your SFL fantasy IPL team through live auctions.</h1>
        <p className="subtle">
          SFL, St. Thomas Fantasy League, is a fantasy game built for creating
          IPL teams through auctions, shaping squads with strategy, and then
          battling it out after the auction is done. It is actually GAMBLING.
        </p>
        <div className="stats-strip">
          <div className="stat-tile">
            <strong>Live auction rooms</strong>
            Create a room, invite your group, and run the auction together in real time.
          </div>
          <div className="stat-tile">
            <strong>Fantasy squad building</strong>
            Buy players, manage your purse, and build the team you want for the season.
          </div>
          <div className="stat-tile">
            <strong>Results and room control</strong>
            Track sold players, room progress, squads, and results in one place.
          </div>
        </div>
      </section>
    </main>
  );
}
