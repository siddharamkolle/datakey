"use client";

import React, { use, Suspense } from "react";
import PublicScanPage from "@/components/public/PublicScanPage";
import { VaultProvider } from "@/lib/vault/vaultContext";
import { RefreshCw } from "lucide-react";

function TokenPageContent({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  return <PublicScanPage token={resolvedParams.token} />;
}

export default function DynamicTokenScanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <VaultProvider>
      <main className="flex min-h-screen flex-col items-center justify-center p-2 sm:p-4">
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-[#cdcbca]/50" />
            </div>
          }
        >
          <TokenPageContent params={params} />
        </Suspense>
      </main>
    </VaultProvider>
  );
}
