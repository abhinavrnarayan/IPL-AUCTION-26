import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import IntroSplashWrapper from "@/components/intro-splash-wrapper";
import { AmbientBackground } from "@/components/ambient-background";
import AuctionAIWidget from "@/components/ai/auction-ai-widget";

import "./globals.css";

const displayFont = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "SFL | St. Thomas Fantasy League",
  description:
    "A live fantasy IPL auction game for building teams, running rooms, and tracking results.",
  icons: {
    icon: "/images/sfl.png",
    apple: "/images/sfl.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="sfl-server-time" content={Date.now().toString()} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <AmbientBackground />
        <IntroSplashWrapper />

        {children}

        {/* 👇 Add AI Widget here */}
        <AuctionAIWidget />
      </body>
    </html>
  );
}
