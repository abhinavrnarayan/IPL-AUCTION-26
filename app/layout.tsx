import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import IntroSplashWrapper from "@/components/intro-splash-wrapper";

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
  description: "A live fantasy IPL auction game for building teams, running rooms, and tracking results.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <IntroSplashWrapper />
        {children}
      </body>
    </html>
  );
}
