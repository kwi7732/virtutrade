import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "VirtuTrade — Virtual Crypto Exchange",
  description: "Practice crypto trading risk-free with real-time Binance prices. Get ₩100M / $70K virtual seed money.",
  keywords: ["crypto", "trading", "virtual", "exchange", "binance", "bitcoin"],
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0e11",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
