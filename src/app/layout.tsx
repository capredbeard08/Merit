import type { Metadata } from "next";
import "./globals.css";
import BootSplash from "@/components/BootSplash";

export const metadata: Metadata = {
  title: "MERIT — Customer intelligence, quietly automated",
  description:
    "Privacy-first customer feedback and intelligence for establishments and corporations.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><BootSplash />{children}</body></html>;
}
