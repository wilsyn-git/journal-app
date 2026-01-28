import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TimezoneSync } from "@/components/TimezoneSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const org = await prisma.organization.findFirst({
    orderBy: { users: { _count: 'desc' } }
  })

  const siteName = org?.siteName || "myJournal";
  const title = `${siteName} | De-clutter your mind`;

  return {
    title,
    description: "A focused journaling application for daily reflection and personal growth.",
    openGraph: {
      title: siteName,
      description: "Capture your thoughts, find clarity, and track your personal growth.",
      siteName: siteName,
      locale: "en_US",
      type: "website",
    },
    icons: org?.logoUrl ? [{ rel: "icon", url: org.logoUrl }] : undefined
  }
}

import { prisma } from "@/lib/prisma"
import { BrandingProvider } from "@/components/BrandingProvider"
import { ToastProvider } from "@/components/providers/ToastProvider"
import { ActivityTracker } from "@/components/ActivityTracker"

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch branding (prioritize active org)
  const org = await prisma.organization.findFirst({
    orderBy: { users: { _count: 'desc' } }
  })

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TimezoneSync />
        <ToastProvider>
          <BrandingProvider siteName={org?.siteName} logoUrl={org?.logoUrl}>
            {children}
            <ActivityTracker />
          </BrandingProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
