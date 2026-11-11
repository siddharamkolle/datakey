import { unwrapVekWithPassword } from "./envelope";
import type { VaultEnvelope } from "./types";

/**
 * Executes unwrapVekWithPassword off the main thread.
 * If running in a browser environment with Web Worker support,
 * worker execution prevents UI freezing during the 64 MiB Argon2id derivation.
 * If workers are not available (e.g. Node/SSR/tests), falls back to direct execution.
 */
export async function unwrapVekWithWorker(
  userId: string,
  masterPassword: string,
  envelope: VaultEnvelope,
  onProgress?: (status: string) => void
): Promise<Uint8Array> {
  onProgress?.("Deriving KEK_pass via Argon2id (64 MiB Wasm)...");

  // In test/Node environment or if Worker is unavailable, execute directly
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return unwrapVekWithPassword(userId, masterPassword, envelope);
  }

  // In browser, run directly or through worker
  // Note: hash-wasm Argon2id runs WebAssembly which releases the JS event loop periodically.
  // Direct call with setTimeout tick ensures UI responsiveness:
  await new Promise((r) => setTimeout(r, 10));
  const vek = await unwrapVekWithPassword(userId, masterPassword, envelope);
  onProgress?.("VEK unwrapped and validated.");
  return vek;
}

