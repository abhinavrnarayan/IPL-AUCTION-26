"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const IntroSplash = dynamic(() => import("./intro-splash"), { ssr: false });

export default function IntroSplashWrapper() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return null;
  }

  return <IntroSplash />;
}
