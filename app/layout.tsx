import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Distribution is WhatsApp forwards, so the link preview IS the front door:
// without these tags a shared link renders as a bare grey URL. Description
// leads with the patient benefit — patients are the end customer, and MRs and
// chambers benefit because patients arrive.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://medconnect-india.vercel.app";
const DESCRIPTION =
  "See which doctors are sitting today before you travel. Live availability, chamber timings and a number that answers — for patients, chamber staff and medical representatives across India.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MedConnect India — Is the doctor available right now?",
    template: "%s · MedConnect India",
  },
  description: DESCRIPTION,
  applicationName: "MedConnect India",
  openGraph: {
    type: "website",
    siteName: "MedConnect India",
    title: "Is the doctor available right now?",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Is the doctor available right now?",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (password managers,
          Grammarly, dark-mode) inject attributes into <body> before React
          loads, causing a false hydration warning. This silences only that. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
