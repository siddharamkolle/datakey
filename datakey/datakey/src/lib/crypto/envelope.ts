import { VaultEnvelope } from "./types";
import { deriveKekPass, deriveKekRecov, toBase64, fromBase64 } from "./kdf";
import { zeroBuffer, zeroBuffers } from "./memory";

/**
 * Creates an initial Vault Envelope:
 * Generates 256-bit VEK, wraps it under KEK_pass and KEK_recov.
 */
export async function createVaultEnvelope(
  userId: string,
  masterPassword: string,
  recoveryPhrase: string,
  keyVersion = 1
): Promise<{ envelope: VaultEnvelope; rawVek: Uint8Array }> {
  // 1. Generate 256-bit CSPRNG VEK
  const rawVek = new Uint8Array(32);
  crypto.getRandomValues(rawVek);

  // 2. Generate 16-byte random salts for KDFs
  const saltVault = new Uint8Array(16);
  crypto.getRandomValues(saltVault);

  const saltRecov = new Uint8Array(16);
  crypto.getRandomValues(saltRecov);

  // 3. Derive KEK_pass & KEK_recov
  const kekPass = await deriveKekPass(masterPassword, saltVault);
  const kekRecov = await deriveKekRecov(recoveryPhrase);

  // 4. Wrap VEK under KEK_pass
  const ivPass = new Uint8Array(12);
  crypto.getRandomValues(ivPass);
  const aadPass = new TextEncoder().encode(`${userId}:${keyVersion}:pass`);

  const keyPassCrypto = await crypto.subtle.importKey(
    "raw",
    kekPass as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const wrappedVekPassBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivPass as unknown as BufferSource, additionalData: aadPass as unknown as BufferSource },
    keyPassCrypto,
    rawVek as unknown as BufferSource
  );

  // 5. Wrap VEK under KEK_recov
  const ivRecov = new Uint8Array(12);
  crypto.getRandomValues(ivRecov);
  const aadRecov = new TextEncoder().encode(`${userId}:${keyVersion}:recov`);

  const keyRecovCrypto = await crypto.subtle.importKey(
    "raw",
    kekRecov as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const wrappedVekRecovBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivRecov as unknown as BufferSource, additionalData: aadRecov as unknown as BufferSource },
    keyRecovCrypto,
    rawVek as unknown as BufferSource
  );

  zeroBuffers(kekPass, kekRecov);

  const envelope: VaultEnvelope = {
    key_version: keyVersion,
    wrapped_vek_pass: toBase64(new Uint8Array(wrappedVekPassBuf)),
    salt_vault: toBase64(saltVault),
    iv_pass: toBase64(ivPass),
    argon_memory: 65536,
    argon_iterations: 3,
    wrapped_vek_recov: toBase64(new Uint8Array(wrappedVekRecovBuf)),
    salt_recov: toBase64(saltRecov),
    iv_recov: toBase64(ivRecov),
  };

  return { envelope, rawVek };
}

/**
 * Unwraps VEK using Master Password
 */
export async function unwrapVekWithPassword(
  userId: string,
  masterPassword: string,
  envelope: VaultEnvelope
): Promise<Uint8Array> {
  const salt = fromBase64(envelope.salt_vault);
  const kekPass = await deriveKekPass(
    masterPassword,
    salt,
    envelope.argon_memory,
    envelope.argon_iterations
  );

  const keyPassCrypto = await crypto.subtle.importKey(
    "raw",
    kekPass as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const iv = fromBase64(envelope.iv_pass);
  const aad = new TextEncoder().encode(`${userId}:${envelope.key_version}:pass`);
  const ciphertext = fromBase64(envelope.wrapped_vek_pass);

  try {
    const rawVekBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
      keyPassCrypto,
      ciphertext as unknown as BufferSource
    );
    zeroBuffer(kekPass);
    return new Uint8Array(rawVekBuf);
  } catch {
    zeroBuffer(kekPass);
    throw new Error("Failed to unwrap vault key: invalid master password or tampered envelope");
  }
}

/**
 * Unwraps VEK using 24-Word Recovery Phrase
 */
export async function unwrapVekWithRecoveryPhrase(
  userId: string,
  recoveryPhrase: string,
  envelope: VaultEnvelope
): Promise<Uint8Array> {
  const kekRecov = await deriveKekRecov(recoveryPhrase);

  const keyRecovCrypto = await crypto.subtle.importKey(
    "raw",
    kekRecov as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const iv = fromBase64(envelope.iv_recov);
  const aad = new TextEncoder().encode(`${userId}:${envelope.key_version}:recov`);
  const ciphertext = fromBase64(envelope.wrapped_vek_recov);

  try {
    const rawVekBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
      keyRecovCrypto,
      ciphertext as unknown as BufferSource
    );
    zeroBuffer(kekRecov);
    return new Uint8Array(rawVekBuf);
  } catch {
    zeroBuffer(kekRecov);
    throw new Error("Failed to unwrap vault key: invalid 24-word recovery phrase or tampered envelope");
  }
}

/**
 * Re-wraps existing VEK with a new Master Password
 * Does NOT require re-encrypting vault items.
 */
export async function rewrapVekWithNewPassword(
  userId: string,
  newMasterPassword: string,
  existingVek: Uint8Array,
  currentKeyVersion: number
): Promise<{
  wrapped_vek_pass: string;
  salt_vault: string;
  iv_pass: string;
}> {
  const newSalt = new Uint8Array(16);
  crypto.getRandomValues(newSalt);

  const newKekPass = await deriveKekPass(newMasterPassword, newSalt);
  const newIv = new Uint8Array(12);
  crypto.getRandomValues(newIv);

  const keyCrypto = await crypto.subtle.importKey(
    "raw",
    newKekPass as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const aad = new TextEncoder().encode(`${userId}:${currentKeyVersion}:pass`);
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: newIv as unknown as BufferSource, additionalData: aad as unknown as BufferSource },
    keyCrypto,
    existingVek as unknown as BufferSource
  );

  zeroBuffer(newKekPass);

  return {
    wrapped_vek_pass: toBase64(new Uint8Array(wrappedBuf)),
    salt_vault: toBase64(newSalt),
    iv_pass: toBase64(newIv),
  };
}

