# Security Policy & Threat Model (Architecture V2.2)

> **IMPORTANT DISCLAIMER**: DataKey is an open-source personal security project. It relies exclusively on standardized, established cryptographic primitives (AES-256-GCM, Argon2id, BIP-39, HKDF-SHA256). **We do not use custom cryptography, and we never claim this system is unbreakable.**
> 
> **AN INDEPENDENT THIRD-PARTY SECURITY AUDIT HAS NOT YET BEEN COMPLETED.** An independent security review is strictly required before you store real production passwords, banking credentials, or sensitive government identification documents.

---

## 1. Threat Model Summary

DataKey is engineered under a **Zero-Knowledge Architecture**. The hosting server, database, and object storage providers are treated as untrusted storage relays.

### Trust Boundaries & Key Hierarchy

1. **Master Password & KEK_pass**:
   - Master Password is never sent across the network.
   - Key Encryption Key (`KEK_pass`) is derived client-side via **Argon2id** (64 MiB memory, 3 iterations, single lane).
2. **24-Word Recovery Phrase & KEK_recov**:
   - 256 bits of entropy derived from a standard BIP-39 mnemonic.
   - Derives `KEK_recov` via BIP-39 seed generation + domain-separated **HKDF-SHA256**.
3. **Vault Encryption Key (VEK)**:
   - 256-bit root key generated with CSPRNG (`crypto.getRandomValues`).
   - Dual-wrapped in `VaultEnvelope` under `KEK_pass` and `KEK_recov` using **AES-256-GCM**.
   - Held in volatile memory only while the vault is unlocked; zeroed upon auto-lock or window close.
4. **Subkeys (Domain Separation)**:
   - HKDF-SHA256 expands the VEK into four distinct 256-bit subkeys:
     - `k_record`: For record payload encryption.
     - `k_file_master`: For file encryption key (FEK) wrapping.
     - `k_export`: For export authentication.
     - `k_manifest`: For multi-part backup manifest signing and verification.
5. **Streaming Chunked Files**:
   - Each file has its own randomly generated 256-bit File Encryption Key (`FEK`).
   - Plaintext is partitioned into 2 MiB chunks.
   - Each chunk is encrypted with AES-256-GCM using deterministic nonces (4-byte random prefix + 8-byte big-endian chunk counter) and position-bound Additional Authenticated Data (AAD).
   - Defends against chunk reordering, duplication, truncation, bit-flips, and cross-file chunk swapping.

---

## 2. Attacker Capabilities & Defenses

| Threat Scenario | System Defense |
|---|---|
| **Compromised Supabase Database** | The database only contains ciphertext, random salts, nonces, and auth tags. Without the client-side Master Password or BIP-39 phrase, data cannot be decrypted. |
| **Compromised Cloudflare R2 Storage** | R2 holds only encrypted binary chunks (`chunk_i.bin`). Chunks cannot be decrypted without the per-file FEK, which is wrapped under `k_file_master`. |
| **Stolen Account Login Credentials** | An attacker with your account email and password cannot access your safe. They are stopped by mandatory TOTP 2FA (AAL2), followed by the Master Vault Password. |
| **Physical Keychain Theft (Lost Keychain)** | Activating **Lost Mode** causes the hardened server function to strip all personal medical data and emergency contact numbers at the database layer. |
| **Network Eavesdropping / MITM** | Mandatory HTTPS with TLS 1.3, strict Content Security Policy (CSP) with cryptographic nonces, and HSTS headers. |
| **Finder Form Spam / Bot Flooding** | Cloudflare Turnstile bot verification + Upstash Redis sliding-window rate limiting. No IP addresses are stored in the database. |
| **Memory Dump After Lock** | Memory buffers and typed arrays holding keys are overwritten with zeros (`zeroBuffer` / `zeroBuffers`) immediately upon locking. |

---

## 3. Known Limitations

- **Endpoint Security**: If your personal computer or smartphone has malware, a keylogger, or a compromised browser extension, the attacker could capture keystrokes as you type your Master Password.
- **Physical Loss of Both Secrets**: If you forget your Master Password AND lose your 24-word paper recovery phrase, all vault data is mathematically irrecoverable.
- **Browser Memory Persistence**: While DataKey calls `zeroBuffers()`, some JavaScript garbage collectors may delay freeing old memory allocations. For maximum security, close your browser tab when finished.

---

## 4. Reporting a Vulnerability

If you discover a security vulnerability, please do NOT open a public GitHub issue.

Please report vulnerabilities privately:
- **Email**: `security@datakey.app`
- **PGP Fingerprint**: (Available on request)

Please include:
1. Description of the vulnerability and attack vector.
2. Step-by-step proof of concept (PoC) to reproduce the issue.
3. Your assessment of the impact.

We will acknowledge receipt within 48 hours and provide a remediation timeline.

