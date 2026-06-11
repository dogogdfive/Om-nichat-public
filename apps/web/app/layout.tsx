import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMnichat — Unified stream chat",
  description: "Twitch, Kick, and X live chat in one place.",
  icons: {
    icon: [{ url: "/om-login-star.png", type: "image/png" }],
    apple: [{ url: "/om-login-star.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <Script src="/landing-bootstrap.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
