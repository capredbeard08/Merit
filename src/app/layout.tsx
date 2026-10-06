import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MERIT — Customer intelligence, quietly automated",
  description: "Privacy-first customer feedback and review operations for small businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
