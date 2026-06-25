import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-06-22");
  return [
    { url: "https://www.aoe4scanner.com/", lastModified, changeFrequency: "daily", priority: 1 },
    { url: "https://www.aoe4scanner.com/games", lastModified, changeFrequency: "daily", priority: 0.9 },
    { url: "https://www.aoe4scanner.com/mains", lastModified, changeFrequency: "weekly", priority: 0.8 },
    { url: "https://www.aoe4scanner.com/privacy", lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
