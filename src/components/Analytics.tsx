"use client";

import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/button";

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
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl border border-[#3b443f] border-t-gold bg-[#121715]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gold">Optional analytics</p>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#d0cec4]">
            Help improve AOE4Scanner by sharing anonymous usage data. No advertising or personal profiles.{" "}
            <Link href="/privacy" className="font-medium text-[#e8e3d4] underline decoration-[#777b74] underline-offset-4 transition hover:text-gold">
              Read the privacy details
            </Link>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => choose("denied")}
            className={buttonClassName("ghost")}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className={buttonClassName()}
          >
            Share usage
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
