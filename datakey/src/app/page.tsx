"use client";

import PublicScanPage from "@/components/public/PublicScanPage";
import { VaultProvider } from "@/lib/vault/vaultContext";

export default function Home() {
  return (
    <VaultProvider>
      <main className="flex min-h-screen flex-col items-center justify-center p-2 sm:p-4">
        <PublicScanPage />
      </main>
    </VaultProvider>
  );
}
