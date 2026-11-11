import { argon2id } from "hash-wasm";
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { zeroBuffer } from "./memory";
import { UnwrappedVaultKeys } from "./types";

// Base64 & Hex helpers
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

/**
 * Derives KEK_pass from Master Password using Argon2id Wasm
 * Parameters: memory 64 MiB (65536 KiB), iterations 3, parallelism 1, output 32 bytes
 */
export async function deriveKekPass(
  masterPassword: string,
  salt16: Uint8Array,
  memoryKiB = 65536,
  iterations = 3
): Promise<Uint8Array> {
  const hashHex = await argon2id({
    password: masterPassword,
    salt: salt16,
    parallelism: 1,
    iterations: iterations,
    memorySize: memoryKiB,
    hashLength: 32,
    outputType: "hex",
  });
  return fromHex(hashHex);
}

/**
 * Generates a standard BIP-39 24-word recovery phrase (256 bits entropy)
 */
export function generate24WordMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

/**
 * Validates a BIP-39 mnemonic phrase
 */
export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(phrase.trim().toLowerCase(), wordlist);
}

/**
 * Derives KEK_recov from 24-word recovery phrase:
 * 1. Standard BIP-39 seed generation: PBKDF2-HMAC-SHA512 (2048 iterations) -> 512-bit seed
 * 2. HKDF-SHA256 with info 'datakey/v2.2/kek-recovery' -> 256-bit KEK_recov
 */
export async function deriveKekRecov(phrase: string): Promise<Uint8Array> {
  const normalized = phrase.trim().toLowerCase();
  if (!isValidMnemonic(normalized)) {
    throw new Error("Invalid BIP-39 recovery phrase checksum or wordlist");
  }

  // BIP-39 standard seed (512 bits)
  const seed512 = await mnemonicToSeed(normalized, "");
  
  // Domain-separated HKDF expansion to 32 bytes (256-bit AES key)
  const kekRecov = hkdf(
    sha256,
    seed512,
    new TextEncoder().encode("datakey/v2.2/recovery-salt"),
    new TextEncoder().encode("datakey/v2.2/kek-recovery"),
    32
  );

  zeroBuffer(seed512);
  return kekRecov;
}

/**
 * Derives domain-separated 256-bit subkeys from VEK via HKDF-SHA256
 */
export function deriveSubkeysFromVek(vek: Uint8Array): UnwrappedVaultKeys {
  const k_record = hkdf(
    sha256,
    vek,
    new TextEncoder().encode("datakey/v2.2/subkeys-salt"),
    new TextEncoder().encode("datakey/v2.2/records"),
    32
  );

  const k_file_master = hkdf(
    sha256,
    vek,
    new TextEncoder().encode("datakey/v2.2/subkeys-salt"),
    new TextEncoder().encode("datakey/v2.2/files"),
    32
  );

  const k_export = hkdf(
    sha256,
    vek,
    new TextEncoder().encode("datakey/v2.2/subkeys-salt"),
    new TextEncoder().encode("datakey/v2.2/export"),
    32
  );

  const k_manifest = hkdf(
    sha256,
    vek,
    new TextEncoder().encode("datakey/v2.2/subkeys-salt"),
    new TextEncoder().encode("datakey/v2.2/manifest"),
    32
  );

  return { vek, k_record, k_file_master, k_export, k_manifest };
}
