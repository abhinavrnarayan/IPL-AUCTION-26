import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import IntroSplashWrapper from "@/components/intro-splash-wrapper";
import { AmbientBackground } from "@/components/ambient-background";
import AuctionAIWidget from "@/components/ai/auction-ai-widget";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { getSessionUser } from "@/lib/server/auth";

import "./globals.css";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

const base =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://sfl.vercel.app";

const SITE_NAME = "SFL — St. Thomas Fantasy League";
const SITE_DESCRIPTION =
  "SFL is a live fantasy IPL auction game where you build your IPL squad by bidding on real players. Create private auction rooms, manage your purse, draft your team, and track results — all in real time.";
const OG_IMAGE = `${base}/images/sfl.png`;

export const metadata: Metadata = {
  metadataBase: new URL(base),

  title: {
    default: "SFL | Fantasy IPL Auction — St. Thomas Fantasy League",
    template: "%s | SFL Fantasy IPL",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "fantasy IPL",
    "IPL auction game",
    "fantasy cricket auction",
    "live IPL auction",
    "IPL fantasy league",
    "build IPL team online",
    "IPL player bidding game",
    "fantasy cricket team builder",
    "IPL 2026 fantasy",
    "St. Thomas Fantasy League",
    "SFL auction",
    "online cricket auction",
  ],

  alternates: {
    canonical: base,
  },

  openGraph: {
    type: "website",
    locale: "en_IN",
    url: base,
    siteName: SITE_NAME,
    title: "SFL — Live Fantasy IPL Auction Game",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 512,
        height: 512,
        alt: "SFL — St. Thomas Fantasy League logo",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "SFL — Live Fantasy IPL Auction Game",
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },

  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/images/sfl.png", type: "image/png" }],
    shortcut: "/favicon.ico",
    apple: "/images/sfl.png",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${base}/#webapp`,
      name: SITE_NAME,
      url: base,
      description: SITE_DESCRIPTION,
      applicationCategory: "GameApplication",
      applicationSubCategory: "SportsGame",
      operatingSystem: "Web",
      browserRequirements: "Requires JavaScript. Requires a modern browser.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
      },
      featureList: [
        "Live real-time IPL player auction",
        "Private auction rooms with unique codes",
        "Purse management and squad building",
        "Live bid tracking and team results",
        "Fantasy IPL team creation",
      ],
      screenshot: OG_IMAGE,
      inLanguage: "en",
    },
    {
      "@type": "Organization",
      "@id": `${base}/#org`,
      name: "St. Thomas Fantasy League",
      alternateName: "SFL",
      url: base,
      logo: {
        "@type": "ImageObject",
        url: OG_IMAGE,
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${base}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is SFL — St. Thomas Fantasy League?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SFL (St. Thomas Fantasy League) is a live fantasy IPL auction game where participants create private rooms, bid on IPL players, build squads within a purse limit, and compete based on real match performance.",
          },
        },
        {
          "@type": "Question",
          name: "How does the fantasy IPL auction work on SFL?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The admin creates an auction room and uploads a player list. Each participant is assigned a team with a purse. Players are auctioned one by one in real time — participants place bids, the highest bidder wins the player, and the purse is deducted accordingly.",
          },
        },
        {
          "@type": "Question",
          name: "Is SFL free to use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, SFL is free to use. Create an account, join or create a room, and start your fantasy IPL auction at no cost.",
          },
        },
        {
          "@type": "Question",
          name: "Can I play fantasy IPL with friends on SFL?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. SFL is designed for private group play. The room admin shares a unique room code with friends, who join and participate in the live auction together.",
          },
        },
        {
          "@type": "Question",
          name: "Which IPL players can I bid on?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SFL supports live IPL 2026 player data. The room admin can upload a full player list including batters, bowlers, all-rounders, and wicket-keepers from all IPL franchises.",
          },
        },
      ],
    },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Fetch user on the server so the sidebar has profile data on first render.
  // Never throws — returns null when Supabase isn't configured or user is logged out.
  const user = await getSessionUser().catch(() => null);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="sfl-server-time" content={Date.now().toString()} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}>
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
        <AmbientBackground />
        <IntroSplashWrapper />
        <AppSidebar user={user} />

        {children}

        <AuctionAIWidget />
      </body>
    </html>
  );
}
