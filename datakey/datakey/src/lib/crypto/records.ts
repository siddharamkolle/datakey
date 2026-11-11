import { EncryptedRecordPayload } from "./types";
import { toBase64, fromBase64 } from "./kdf";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { zeroBuffer } from "./memory";

const SCHEMA_VERSION = "v2.2";

/**
 * Encrypts a record using a single-use derived key:
 * 1. Generates 16-byte random salt.
 * 2. Derives single-use key via HKDF-SHA256 from K_record with info = `${category}:${recordId}`.
 * 3. Generates 96-bit random nonce.
 * 4. Encrypts payload with AES-256-GCM and position-bound AAD.
 */
export async function encryptRecord(
  kRecord: Uint8Array,
  userId: string,
  recordId: string,
  category: string,
  plaintextData: Record<string, unknown> | string,
  keyVersion = 1
): Promise<EncryptedRecordPayload> {
  const jsonStr = typeof plaintextData === "string" ? plaintextData : JSON.stringify(plaintextData);
  const plaintextBytes = new TextEncoder().encode(jsonStr);

  // 1. Generate 16-byte random salt
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  // 2. Derive single-use key via HKDF-SHA256
  const oneTimeKeyBytes = hkdf(
    sha256,
    kRecord,
    salt,
    new TextEncoder().encode(`${category}:${recordId}`),
    32
  );

  const oneTimeKey = await crypto.subtle.importKey(
    "raw",
    oneTimeKeyBytes as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  // 3. Generate random 96-bit nonce
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  // 4. Construct AAD binding
  const aad = new TextEncoder().encode(
    `${userId}:${recordId}:${category}:${keyVersion}:${SCHEMA_VERSION}`
  );

  // 5. Encrypt with AES-256-GCM
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
    oneTimeKey,
    plaintextBytes as unknown as BufferSource
  );

  zeroBuffer(oneTimeKeyBytes);

  // In Web Crypto AES-GCM, the 16-byte auth tag is appended to the ciphertext output
  const cipherBytesWithTag = new Uint8Array(cipherBuffer);
  const tagLength = 16;
  const ciphertextBytes = cipherBytesWithTag.slice(0, cipherBytesWithTag.length - tagLength);
  const tagBytes = cipherBytesWithTag.slice(cipherBytesWithTag.length - tagLength);

  return {
    salt: toBase64(salt),
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertextBytes),
    auth_tag: toBase64(tagBytes),
    key_version: keyVersion,
    category,
    record_id: recordId,
  };
}

/**
 * Decrypts a record using the single-use derived key:
 * Re-derives the one-time key with the stored salt, verifies AAD and auth tag.
 */
export async function decryptRecord<T = Record<string, unknown>>(
  kRecord: Uint8Array,
  userId: string,
  record: EncryptedRecordPayload
): Promise<T> {
  const salt = fromBase64(record.salt);
  const nonce = fromBase64(record.nonce);
  const ciphertext = fromBase64(record.ciphertext);
  const authTag = fromBase64(record.auth_tag);

  // Reconstruct full buffer (ciphertext + 16-byte tag) for Web Crypto AES-GCM
  const combinedBuffer = new Uint8Array(ciphertext.length + authTag.length);
  combinedBuffer.set(ciphertext, 0);
  combinedBuffer.set(authTag, ciphertext.length);

  // Re-derive the identical single-use key
  const oneTimeKeyBytes = hkdf(
    sha256,
    kRecord,
    salt,
    new TextEncoder().encode(`${record.category}:${record.record_id}`),
    32
  );

  const oneTimeKey = await crypto.subtle.importKey(
    "raw",
    oneTimeKeyBytes as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const aad = new TextEncoder().encode(
    `${userId}:${record.record_id}:${record.category}:${record.key_version}:${SCHEMA_VERSION}`
  );

  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
      oneTimeKey,
      combinedBuffer as unknown as BufferSource
    );

    zeroBuffer(oneTimeKeyBytes);

    const decryptedStr = new TextDecoder().decode(decryptedBuf);
    try {
      return JSON.parse(decryptedStr) as T;
    } catch {
      return decryptedStr as unknown as T;
    }
  } catch {
    zeroBuffer(oneTimeKeyBytes);
    throw new Error(
      `Decryption failed for record ${record.record_id}: data tampered, invalid key, or corrupt tag`
    );
  }
}
