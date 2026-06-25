"use client";

import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-8WLV7XMXK1";
const CONSENT_KEY = "aoe4scanner:analytics-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function hasAnalyticsConsent() {
  return localStorage.getItem(CONSENT_KEY) === "granted";
}

function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    function sendPageView() {
      if (!window.gtag || !hasAnalyticsConsent()) return;
      window.gtag("event", "page_view", {
        page_path: pathname,
        page_title: document.title,
      });
    }

    sendPageView();
    window.addEventListener("aoe4scanner:analytics-consent-changed", sendPageView);
    return () => window.removeEventListener("aoe4scanner:analytics-consent-changed", sendPageView);
  }, [pathname]);

  useEffect(() => {
    function trackOutboundClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor?.href) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin || !window.gtag || !hasAnalyticsConsent()) return;
      window.gtag("event", "outbound_click", {
        link_domain: url.hostname,
        link_url: `${url.origin}${url.pathname}`,
      });
    }

    document.addEventListener("click", trackOutboundClick);
    return () => document.removeEventListener("click", trackOutboundClick);
  }, []);

  return null;
}

function ConsentBanner() {
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    setChoice(localStorage.getItem(CONSENT_KEY));
  }, []);

  function choose(nextChoice: "granted" | "denied") {
    localStorage.setItem(CONSENT_KEY, nextChoice);
    setChoice(nextChoice);
    window.gtag?.("consent", "update", {
      analytics_storage: nextChoice,
    });
    window.dispatchEvent(new Event("aoe4scanner:analytics-consent-changed"));
  }

  if (choice) return null;

  return (
    <aside
      aria-label="Analytics preference"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-white/15 bg-slate-950/95 p-4 shadow-2xl backdrop-blur"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-300">
          May I use analytics to understand which parts of AOE4Scanner are useful?{" "}
          <Link href="/privacy" className="text-sky-200 underline underline-offset-2">
            Privacy details
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-md bg-sky-400 px-3 py-2 text-sm font-bold text-slate-950"
          >
            Allow
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Analytics() {
  if (!measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            analytics_storage: localStorage.getItem('${CONSENT_KEY}') === 'granted' ? 'granted' : 'denied',
            wait_for_update: 500
          });
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
      <PageViewTracker />
      <ConsentBanner />
    </>
  );
}
