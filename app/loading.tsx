import Image from "next/image";

import sflLogo from "./images/sfl.png";

export default function Loading() {
  return (
    <main className="sfl-loader-screen" aria-live="polite" aria-busy="true">
      <div className="sfl-loader-aurora sfl-loader-aurora-left" aria-hidden="true" />
      <div className="sfl-loader-aurora sfl-loader-aurora-right" aria-hidden="true" />

      <div className="sfl-loader-center">
        <div className="sfl-loader-core" aria-hidden="true">
          <div className="sfl-loader-ring sfl-loader-ring-outer" />
          <div className="sfl-loader-ring sfl-loader-ring-inner" />
          <div className="sfl-loader-logo-wrap">
            <Image
              alt="SFL"
              className="sfl-loader-logo"
              priority
              src={sflLogo}
              width={96}
              height={96}
            />
          </div>
        </div>

        <div className="sfl-loader-text">
          <div className="sfl-loader-wordmark">SFL</div>
          <div className="sfl-loader-subtitle">St. Thomas Fantasy League</div>
          <div className="sfl-loader-caption">Fantasy auction platform</div>
        </div>
      </div>
    </main>
  );
}
