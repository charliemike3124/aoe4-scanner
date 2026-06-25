import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dev/", "/scanOutliersNow", "/rescoreSavedOutliersNow", "/refreshMapPoolNow", "/refreshAgeupStatsNow"],
    },
    sitemap: "https://www.aoe4scanner.com/sitemap.xml",
    host: "https://www.aoe4scanner.com",
  };
}
