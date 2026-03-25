import Image from "next/image";

import sflLogo from "./images/sfl.png";

export default function Loading() {
  return (
    <main className="sfl-loader-screen" aria-live="polite" aria-busy="true">
      <div className="sfl-loader-orb sfl-loader-orb-one" />
      <div className="sfl-loader-orb sfl-loader-orb-two" />
      <div className="sfl-loader-core">
        <div className="sfl-loader-ring sfl-loader-ring-outer" />
        <div className="sfl-loader-ring sfl-loader-ring-inner" />
        <div className="sfl-loader-logo-wrap">
          <Image
            alt="SFL logo"
            className="sfl-loader-logo"
            priority
            src={sflLogo}
            width={112}
            height={112}
          />
        </div>
      </div>
      <div className="sfl-loader-copy">
        <div className="sfl-loader-wordmark">SFL</div>
        <div className="sfl-loader-subtitle">St. Thomas Fantasy League</div>
      </div>
      <div className="sfl-loader-bar" aria-hidden="true">
        <span />
      </div>
    </main>
  );
}
