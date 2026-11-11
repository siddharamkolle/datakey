import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VaultProvider } from "@/lib/vault/vaultContext";

export const metadata: Metadata = {
  title: "DataKey • Personal Public Hub & Encrypted Vault",
  description: "Personal public identity card, emergency contact hub, and zero-knowledge encrypted data vault.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.svg",
    apple: "/icon-192.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DataKey",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#080808",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080808] text-[#cdcbca] antialiased selection:bg-[#cdcbca]/20 selection:text-[#cdcbca]">
        <div className="ambient-glow" id="ambient-backdrop" />
        <div className="relative z-10 flex min-h-screen flex-col">
          <VaultProvider>{children}</VaultProvider>
        </div>
      </body>
    </html>
  );
}
