import type { Metadata } from "next";
import "./globals.css";
import SystemNav from "@/components/SystemNav";

export const metadata: Metadata = {
  title: "ChainMind AI+ | AI Command Center",
  description: "AI-powered supply chain intelligence command center. Real-time risk assessment, simulation, and autonomous decision-making.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="grid-bg">
        {children}
        <SystemNav />
      </body>
    </html>
  );
}
