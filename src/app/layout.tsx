import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ConnectionBanner } from "@/components/connection-banner";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blast Radius — npm supply chain explorer",
  description:
    "Explore who can publish code into the applications you deploy, and the exact dependency chains that let them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg">
        <ConnectionBanner />
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-border-subtle px-4 py-6">
          <p className="mx-auto max-w-6xl text-[12px] text-text-subtle">
            Data from the public npm registry and OSV.dev. Graph stored in CognoDB.
          </p>
        </footer>
      </body>
    </html>
  );
}
