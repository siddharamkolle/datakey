import { AuthenticatedFileManifest, FileChunkEncrypted } from "./types";
import { toBase64, fromBase64, toHex } from "./kdf";
import { sha256 } from "@noble/hashes/sha2.js";
import { zeroBuffer } from "./memory";

export const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2 MiB

/**
 * Builds a deterministic 12-byte nonce for chunk i:
 * 4-byte random file prefix || 8-byte big-endian chunk index
 */
export function buildChunkNonce(filePrefix4: Uint8Array, chunkIndex: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(filePrefix4, 0);
  const view = new DataView(nonce.buffer);
  view.setBigUint64(4, BigInt(chunkIndex), false);
  return nonce;
}

/**
 * Builds AAD for chunk i
 */
export function buildChunkAad(
  fileId: string,
  userId: string,
  chunkIndex: number,
  totalChunks: number,
  isLastChunk: boolean,
  keyVersion = 1
): Uint8Array {
  return new TextEncoder().encode(
    `${fileId}:${userId}:${chunkIndex}:${totalChunks}:${isLastChunk ? 1 : 0}:${keyVersion}`
  );
}

/**
 * Encrypts a raw binary file into authenticated 2 MiB chunks with an authenticated manifest
 */
export async function encryptFile(
  kFileMaster: Uint8Array,
  userId: string,
  fileId: string,
  fileName: string,
  mimeType: string,
  plaintextBytes: Uint8Array,
  chunkSize = DEFAULT_CHUNK_SIZE,
  keyVersion = 1
): Promise<{
  manifest: AuthenticatedFileManifest;
  chunks: FileChunkEncrypted[];
}> {
  // 1. Generate unique 256-bit FEK
  const fek = new Uint8Array(32);
  crypto.getRandomValues(fek);

  // 2. Generate 4-byte random prefix for chunk nonces
  const filePrefix4 = new Uint8Array(4);
  crypto.getRandomValues(filePrefix4);

  // 3. Wrap FEK under K_file_master
  const fekIv = new Uint8Array(12);
  crypto.getRandomValues(fekIv);
  const fekAad = new TextEncoder().encode(`${userId}:${fileId}:fek:${keyVersion}`);

  const kFileMasterCrypto = await crypto.subtle.importKey(
    "raw",
    kFileMaster as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const wrappedFekBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: fekIv as unknown as BufferSource, additionalData: fekAad as unknown as BufferSource },
    kFileMasterCrypto,
    fek as unknown as BufferSource
  );

  // 4. Import FEK for chunk encryption
  const fekCrypto = await crypto.subtle.importKey(
    "raw",
    fek as unknown as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const totalChunks = Math.max(1, Math.ceil(plaintextBytes.length / chunkSize));
  const chunks: FileChunkEncrypted[] = [];
  const chunkHashes: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const isLast = i === totalChunks - 1;
    const start = i * chunkSize;
    const end = Math.min(plaintextBytes.length, start + chunkSize);
    const chunkPlain = plaintextBytes.slice(start, end);

    const nonce = buildChunkNonce(filePrefix4, i);
    const aad = buildChunkAad(fileId, userId, i, totalChunks, isLast, keyVersion);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
      fekCrypto,
      chunkPlain as unknown as BufferSource
    );

    const cipherBytes = new Uint8Array(cipherBuffer);
    const chunkHash = toHex(sha256(cipherBytes));
    chunkHashes.push(chunkHash);

    chunks.push({
      chunk_index: i,
      total_chunks: totalChunks,
      is_last_chunk: isLast,
      ciphertext_with_tag: cipherBytes,
      chunk_hash_sha256: chunkHash,
    });
  }

  zeroBuffer(fek);

  const manifest: AuthenticatedFileManifest = {
    file_id: fileId,
    original_file_name: fileName,
    mime_type: mimeType,
    plaintext_size: plaintextBytes.length,
    chunk_size: chunkSize,
    total_chunks: totalChunks,
    chunk_hashes: chunkHashes,
    wrapped_fek: toBase64(new Uint8Array(wrappedFekBuf)),
    fek_iv: toBase64(fekIv),
    file_prefix: toBase64(filePrefix4),
    created_at: new Date().toISOString(),
  };

  return { manifest, chunks };
}

/**
 * Decrypts file chunks and verifies manifest integrity
 */
export async function decryptFile(
  kFileMaster: Uint8Array,
  userId: string,
  manifest: AuthenticatedFileManifest,
  chunks: FileChunkEncrypted[],
  keyVersion = 1
): Promise<Uint8Array> {
  // 1. Verify chunk count matches manifest
  if (chunks.length !== manifest.total_chunks) {
    throw new Error(
      `File integrity failed: expected ${manifest.total_chunks} chunks, received ${chunks.length}`
    );
  }

  const filePrefix4 = fromBase64(manifest.file_prefix);

  // 2. Unwrap FEK
  const fekIv = fromBase64(manifest.fek_iv);
  const wrappedFek = fromBase64(manifest.wrapped_fek);
  const fekAad = new TextEncoder().encode(`${userId}:${manifest.file_id}:fek:${keyVersion}`);

  const kFileMasterCrypto = await crypto.subtle.importKey(
    "raw",
    kFileMaster as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  let rawFek: Uint8Array;
  try {
    const rawFekBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fekIv as unknown as BufferSource, additionalData: fekAad as unknown as BufferSource },
      kFileMasterCrypto,
      wrappedFek as unknown as BufferSource
    );
    rawFek = new Uint8Array(rawFekBuf);
  } catch {
    throw new Error("File decryption failed: invalid file master key or corrupted wrapped FEK");
  }

  const fekCrypto = await crypto.subtle.importKey(
    "raw",
    rawFek as unknown as BufferSource,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  // 3. Verify and decrypt each chunk in strict index order
  const decryptedChunks: Uint8Array[] = [];
  let totalDecryptedBytes = 0;

  for (let i = 0; i < manifest.total_chunks; i++) {
    const chunk = chunks[i];
    if (!chunk || chunk.chunk_index !== i) {
      zeroBuffer(rawFek);
      throw new Error(`File integrity failed: missing or out-of-order chunk ${i}`);
    }

    // Verify SHA-256 chunk hash against manifest
    const computedHash = toHex(sha256(chunk.ciphertext_with_tag));
    if (computedHash !== manifest.chunk_hashes[i]) {
      zeroBuffer(rawFek);
      throw new Error(`File integrity failed: hash mismatch on chunk ${i}`);
    }

    const isLast = i === manifest.total_chunks - 1;
    if (chunk.is_last_chunk !== isLast) {
      zeroBuffer(rawFek);
      throw new Error(`File integrity failed: invalid is_last_chunk flag on chunk ${i}`);
    }

    const nonce = buildChunkNonce(filePrefix4, i);
    const aad = buildChunkAad(manifest.file_id, userId, i, manifest.total_chunks, isLast, keyVersion);

    try {
      const decBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
        fekCrypto,
        chunk.ciphertext_with_tag as unknown as BufferSource
      );
      const decBytes = new Uint8Array(decBuf);
      decryptedChunks.push(decBytes);
      totalDecryptedBytes += decBytes.length;
    } catch {
      zeroBuffer(rawFek);
      throw new Error(`File integrity failed: AES-GCM tag verification failed on chunk ${i}`);
    }
  }

  zeroBuffer(rawFek);

  // 4. Verify total decrypted bytes matches manifest plaintext_size
  if (totalDecryptedBytes !== manifest.plaintext_size) {
    throw new Error(
      `File integrity failed: decrypted size ${totalDecryptedBytes} does not match manifest size ${manifest.plaintext_size}`
    );
  }

  // 5. Concatenate all decrypted chunks
  const completeFile = new Uint8Array(totalDecryptedBytes);
  let offset = 0;
  for (const part of decryptedChunks) {
    completeFile.set(part, offset);
    offset += part.length;
  }

  return completeFile;
}
