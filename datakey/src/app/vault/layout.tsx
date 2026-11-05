"use client";

import React from "react";
import { VaultProvider } from "@/lib/vault/vaultContext";

export default function VaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <VaultProvider>{children}</VaultProvider>;
}

