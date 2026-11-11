import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { datakeyConfig } from "@config/datakey.config";
import { fromBase64, toBase64, toHex, fromHex } from "./kdf";
import { zeroBuffer, zeroBuffers } from "./memory";

export const SIMPLE_OWNER_ID = "owner";

export interface SimpleVaultSetupPayload {
  salt: string;
  authToken: string;
  wrappedVekPass: string;
  ivPass: string;
  kdfIterations: number;
  recovAuthToken: string;
  wrappedVekRecov: string;
  ivRecov: string;
  keyVersion: number;
}

export interface RecoveryKeyFileContent {
  app: "DataKey";
  version: number;
  created_at: string;
  recovery_key: string;
}

/**
 * Derives 256-bit KEK_pass (local only) + 256-bit authToken (server auth check)
 * from the Master Password using native Web Crypto PBKDF2-SHA256.
 */
export async function deriveSimplePasswordKeys(
  masterPassword: string,
  saltBase64: string,
  iterations: number = datakeyConfig.security.pbkdf2.iterations
): Promise<{ kekPass: Uint8Array; authToken: string }> {
  const saltBytes = fromBase64(saltBase64);
  const passBytes = new TextEncoder().encode(masterPassword);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    passBytes as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    512 // 64 bytes: 32 bytes KEK_pass + 32 bytes authToken
  );

  const derived = new Uint8Array(derivedBits);
  const kekPass = derived.slice(0, 32);
  const authBytes = derived.slice(32, 64);
  const authToken = toHex(authBytes);

  zeroBuffers(passBytes, derived, authBytes);
  return { kekPass, authToken };
}

/**
 * Generates a human-friendly 256-bit Recovery Key formatted as DK-XXXX-XXXX-...
 */
export function generateSimpleRecoveryKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = toHex(bytes).toUpperCase();
  const groups = hex.match(/.{1,4}/g) || [];
  return `DK-${groups.join("-")}`;
}

/**
 * Parses either a raw DK-... string or the JSON contents of datakey-recovery-key.json.
 */
export function extractRecoveryKeyString(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<RecoveryKeyFileContent>;
      if (typeof parsed.recovery_key === "string" && parsed.recovery_key.trim()) {
        return parsed.recovery_key.trim();
      }
    } catch {
      throw new Error("Invalid recovery key JSON file.");
    }
  }
  return trimmed;
}

function parseRecoveryKeyBytes(recoveryKeyInput: string): Uint8Array {
  const raw = extractRecoveryKeyString(recoveryKeyInput);
  const cleaned = raw.replace(/^DK-/i, "").replace(/[\s-]+/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleaned)) {
    throw new Error("Invalid recovery key format. Expected a valid DK-XXXX-... recovery key.");
  }
  return fromHex(cleaned);
}

/**
 * Derives KEK_recov (local AES wrap key) + recovAuthToken (server check) from a Recovery Key.
 */
export function deriveSimpleRecoveryKeys(recoveryKeyInput: string): {
  kekRecov: Uint8Array;
  recovAuthToken: string;
} {
  const rawBytes = parseRecoveryKeyBytes(recoveryKeyInput);
  const salt = new TextEncoder().encode("datakey/simple/v1/recov-salt");

  const kekRecov = hkdf(
    sha256,
    rawBytes,
    salt,
    new TextEncoder().encode("datakey/simple/v1/recov-kek"),
    32
  );

  const authBytes = hkdf(
    sha256,
    rawBytes,
    salt,
    new TextEncoder().encode("datakey/simple/v1/recov-auth"),
    32
  );

  const recovAuthToken = toHex(authBytes);
  zeroBuffers(rawBytes, authBytes);
  return { kekRecov, recovAuthToken };
}

async function wrapVekWithAesGcm(
  vek: Uint8Array,
  kek: Uint8Array,
  aadLabel: string
): Promise<{ wrapped: string; iv: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const aad = new TextEncoder().encode(aadLabel);

  const key = await crypto.subtle.importKey(
    "raw",
    kek as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
    },
    key,
    vek as unknown as BufferSource
  );

  return {
    wrapped: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  };
}

async function unwrapVekWithAesGcm(
  wrappedBase64: string,
  ivBase64: string,
  kek: Uint8Array,
  aadLabel: string
): Promise<Uint8Array> {
  const iv = fromBase64(ivBase64);
  const ciphertext = fromBase64(wrappedBase64);
  const aad = new TextEncoder().encode(aadLabel);

  const key = await crypto.subtle.importKey(
    "raw",
    kek as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const plainBuf = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
    },
    key,
    ciphertext as unknown as BufferSource
  );

  return new Uint8Array(plainBuf);
}

/**
 * First-time vault setup: creates root 256-bit VEK + password wrapper + recovery key wrapper.
 */
export async function createSimpleVaultSetup(
  masterPassword: string,
  iterations: number = datakeyConfig.security.pbkdf2.iterations
): Promise<{
  setupPayload: SimpleVaultSetupPayload;
  rawVek: Uint8Array;
  recoveryKey: string;
}> {
  const keyVersion = 1;
  const rawVek = new Uint8Array(32);
  crypto.getRandomValues(rawVek);

  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toBase64(saltBytes);

  const recoveryKey = generateSimpleRecoveryKey();

  const { kekPass, authToken } = await deriveSimplePasswordKeys(masterPassword, salt, iterations);
  const { kekRecov, recovAuthToken } = deriveSimpleRecoveryKeys(recoveryKey);

  const passWrap = await wrapVekWithAesGcm(rawVek, kekPass, `datakey:simple:v${keyVersion}:pass`);
  const recovWrap = await wrapVekWithAesGcm(rawVek, kekRecov, `datakey:simple:v${keyVersion}:recov`);

  zeroBuffers(kekPass, kekRecov);

  return {
    setupPayload: {
      salt,
      authToken,
      wrappedVekPass: passWrap.wrapped,
      ivPass: passWrap.iv,
      kdfIterations: iterations,
      recovAuthToken,
      wrappedVekRecov: recovWrap.wrapped,
      ivRecov: recovWrap.iv,
      keyVersion,
    },
    rawVek,
    recoveryKey,
  };
}

/**
 * Unwraps VEK using the Master Password.
 */
export async function unwrapSimpleVekWithPassword(
  masterPassword: string,
  salt: string,
  wrappedVekPass: string,
  ivPass: string,
  iterations: number,
  keyVersion = 1
): Promise<{ vek: Uint8Array; authToken: string }> {
  const { kekPass, authToken } = await deriveSimplePasswordKeys(masterPassword, salt, iterations);
  try {
    const vek = await unwrapVekWithAesGcm(
      wrappedVekPass,
      ivPass,
      kekPass,
      `datakey:simple:v${keyVersion}:pass`
    );
    zeroBuffer(kekPass);
    return { vek, authToken };
  } catch {
    zeroBuffer(kekPass);
    throw new Error("Incorrect Master Password.");
  }
}

/**
 * Unwraps VEK using the Recovery Key string or JSON file content.
 */
export async function unwrapSimpleVekWithRecoveryKey(
  recoveryKeyInput: string,
  wrappedVekRecov: string,
  ivRecov: string,
  keyVersion = 1
): Promise<{ vek: Uint8Array; recovAuthToken: string }> {
  const { kekRecov, recovAuthToken } = deriveSimpleRecoveryKeys(recoveryKeyInput);
  try {
    const vek = await unwrapVekWithAesGcm(
      wrappedVekRecov,
      ivRecov,
      kekRecov,
      `datakey:simple:v${keyVersion}:recov`
    );
    zeroBuffer(kekRecov);
    return { vek, recovAuthToken };
  } catch {
    zeroBuffer(kekRecov);
    throw new Error("Invalid Recovery Key or corrupted envelope.");
  }
}

/**
 * Re-wraps the existing root VEK with a new Master Password (zero record re-encryption needed).
 */
export async function rewrapSimpleVekWithNewPassword(
  newMasterPassword: string,
  existingVek: Uint8Array,
  keyVersion = 1,
  iterations: number = datakeyConfig.security.pbkdf2.iterations
): Promise<{
  salt: string;
  authToken: string;
  wrappedVekPass: string;
  ivPass: string;
  kdfIterations: number;
}> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toBase64(saltBytes);

  const { kekPass, authToken } = await deriveSimplePasswordKeys(newMasterPassword, salt, iterations);
  const passWrap = await wrapVekWithAesGcm(existingVek, kekPass, `datakey:simple:v${keyVersion}:pass`);
  zeroBuffer(kekPass);

  return {
    salt,
    authToken,
    wrappedVekPass: passWrap.wrapped,
    ivPass: passWrap.iv,
    kdfIterations: iterations,
  };
}

/**
 * Generates a fresh Recovery Key for the existing VEK.
 */
export async function regenerateSimpleRecoveryKey(
  existingVek: Uint8Array,
  keyVersion = 1
): Promise<{
  recoveryKey: string;
  recovAuthToken: string;
  wrappedVekRecov: string;
  ivRecov: string;
}> {
  const recoveryKey = generateSimpleRecoveryKey();
  const { kekRecov, recovAuthToken } = deriveSimpleRecoveryKeys(recoveryKey);
  const recovWrap = await wrapVekWithAesGcm(existingVek, kekRecov, `datakey:simple:v${keyVersion}:recov`);
  zeroBuffer(kekRecov);

  return {
    recoveryKey,
    recovAuthToken,
    wrappedVekRecov: recovWrap.wrapped,
    ivRecov: recovWrap.iv,
  };
}

/**
 * Formats a Recovery Key as a clean JSON file ready to download.
 */
export function buildRecoveryKeyFileJson(recoveryKey: string): string {
  const doc: RecoveryKeyFileContent = {
    app: "DataKey",
    version: 1,
    created_at: new Date().toISOString(),
    recovery_key: recoveryKey,
  };
  return JSON.stringify(doc, null, 2);
}

