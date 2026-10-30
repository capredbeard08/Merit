import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://merit-olive.vercel.app";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy"], disallow: ["/auth", "/dashboard", "/api", "/invite", "/feedback"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
