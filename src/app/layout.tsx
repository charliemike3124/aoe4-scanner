import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aoe4scanner.com"),
  title: {
    default: "AOE4Scanner — Standout Age of Empires IV Games",
    template: "%s | AOE4Scanner",
  },
  description:
    "Discover unusual high-level Age of Empires IV ranked 1v1 games, major upsets, rare civilization wins, and experienced civilization specialists.",
  applicationName: "AOE4Scanner",
  authors: [{ name: "SwaggyProfessor", url: "https://www.youtube.com/@SwaggyProfessor" }],
  creator: "SwaggyProfessor",
  category: "gaming",
  keywords: ["Age of Empires IV", "AOE4", "ranked games", "AOE4 esports", "civilization mains", "game analysis"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "AOE4Scanner",
    title: "AOE4Scanner — Standout Age of Empires IV Games",
    description: "Find high-level AoE4 upsets, rare civilization wins, unusual strategies, and civilization specialists.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AOE4Scanner — Standout Age of Empires IV Games",
    description: "Find high-level AoE4 upsets, rare civilization wins, unusual strategies, and civilization specialists.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#030712",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-white px-3 py-2 text-slate-950 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
