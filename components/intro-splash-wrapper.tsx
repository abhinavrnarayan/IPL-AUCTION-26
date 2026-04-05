"use client";

import { usePathname } from "next/navigation";
import IntroSplash from "./intro-splash";

export default function IntroSplashWrapper() {
  const pathname = usePathname();

  if (pathname !== "/") {
    return null;
  }

  return <IntroSplash />;
}
