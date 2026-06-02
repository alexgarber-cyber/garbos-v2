import type { Metadata, Viewport } from "next";

import "./globals.css";
import { LeftNav } from "@/components/LeftNav";

export const metadata: Metadata = {
  title: "garbos",
  description: "Single-user CRM",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/garbos-favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/garbos-icon-192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#3B5FE5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="flex min-h-screen">
          <LeftNav />
          <main className="flex-1 p-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
