/**
 * DataKey V2.2 Cryptographic Type Definitions
 * Strict zero-knowledge primitives with single-use derived keys.
 */

export interface VaultEnvelope {
  key_version: number;
  wrapped_vek_pass: string; // Base64
  salt_vault: string;        // Base64 16 bytes
  iv_pass: string;           // Base64 12 bytes
  argon_memory: number;      // 64 MiB (65536)
  argon_iterations: number;  // 3
  wrapped_vek_recov: string; // Base64
  salt_recov: string;        // Base64 16 bytes
  iv_recov: string;          // Base64 12 bytes
}

export interface EncryptedRecordPayload {
  salt: string;              // Base64 16-byte salt for one-time key derivation
  nonce: string;             // Base64 12-byte random IV
  ciphertext: string;        // Base64 ciphertext
  auth_tag: string;          // Base64 16-byte GCM authentication tag
  key_version: number;
  category: string;
  record_id: string;
}

export interface FileChunkEncrypted {
  chunk_index: number;
  total_chunks: number;
  is_last_chunk: boolean;
  ciphertext_with_tag: Uint8Array;
  chunk_hash_sha256: string; // Hex
}

export interface AuthenticatedFileManifest {
  file_id: string;
  original_file_name: string;
  mime_type: string;
  plaintext_size: number;
  chunk_size: number;
  total_chunks: number;
  chunk_hashes: string[]; // SHA-256 hex of each ciphertext chunk
  wrapped_fek: string;    // Base64 AES-GCM wrapped FEK under K_file_master
  fek_iv: string;         // Base64 12-byte IV
  file_prefix: string;    // Base64 4-byte random prefix for chunk nonces
  created_at: string;     // ISO timestamp
}

export interface UnwrappedVaultKeys {
  vek: Uint8Array;            // 32-byte raw VEK
  k_record: Uint8Array;       // 32-byte subkey for records
  k_file_master: Uint8Array;  // 32-byte subkey for files
  k_export: Uint8Array;       // 32-byte subkey for exports
  k_manifest: Uint8Array;     // 32-byte subkey for backup manifests
}
