import type { Metadata } from "next";
import "./globals.css";
import BootSplash from "@/components/BootSplash";

export const metadata: Metadata = {
  title: "MERIT — Customer intelligence, quietly automated",
  description:
    "Collect customer feedback consistently, identify recurring issues, and turn insight into better operations.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://merit-olive.vercel.app"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "MERIT — Customer feedback, quietly automated",
    description:
      "Collect customer feedback consistently, identify recurring issues, and turn insight into better operations.",
    url: "/",
    siteName: "MERIT",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "MERIT customer feedback operations" }],
  },
  twitter: {
    card: "summary",
    title: "MERIT — Customer feedback, quietly automated",
    description:
      "Collect customer feedback consistently, identify recurring issues, and turn insight into better operations.",
    images: ["/og-image.svg"],
  },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><BootSplash />{children}</body></html>;
}
