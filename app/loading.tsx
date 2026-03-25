import Image from "next/image";

import sflLogo from "./images/sfl.png";

export default function Loading() {
  return (
    <main className="sfl-loader-screen" aria-live="polite" aria-busy="true">
      {/* Top progress bar */}
      <div className="sfl-loader-topbar" aria-hidden="true">
        <span className="sfl-loader-topbar-fill" />
      </div>

      {/* Vignette */}
      <div className="sfl-loader-vignette" aria-hidden="true" />

      {/* Central content */}
      <div className="sfl-loader-center">
        {/* Logo + wordmark row */}
        <div className="sfl-loader-brand">
          <div className="sfl-loader-logo-wrap">
            <Image
              alt="SFL"
              className="sfl-loader-logo"
              priority
              src={sflLogo}
              width={88}
              height={88}
            />
          </div>

          <div className="sfl-loader-divider" aria-hidden="true" />

          <div className="sfl-loader-text">
            <div className="sfl-loader-wordmark">SFL</div>
            <div className="sfl-loader-subtitle">St. Thomas Fantasy League</div>
          </div>
        </div>

        {/* Precision accent line */}
        <div className="sfl-loader-accent-line" aria-hidden="true">
          <span /><span /><span />
        </div>

        {/* Edition */}
        <div className="sfl-loader-edition" aria-hidden="true">
          Auction Platform · 2026
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sfl-loader-bottom" aria-hidden="true">
        <div className="sfl-loader-bar">
          <span className="sfl-loader-bar-fill" />
        </div>
      </div>
    </main>
  );
}
