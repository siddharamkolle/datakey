# DataKey (V2.2)

> **Zero-Knowledge Personal Identity, Emergency Access & Offline Encrypted Vault**

DataKey bridges the gap between your physical everyday carry (such as a keychain QR code) and an end-to-end encrypted private safe. Built with modern zero-knowledge cryptography, native multi-factor authentication, and an offline recovery architecture.

---

## Visual Identity: Obsidian & Chrome Silver

DataKey features a strict monochrome design system built on two tones and their opacities:
- **Obsidian Black (`#080808`)**: Deep background and surface layers.
- **Chrome Silver (`#cdcbca`)**: High-contrast text, borders, icons, and QR code modules.
- **No accent colors**: System states (Lost Mode, warnings, errors, verification) are expressed through border weight, icons, opacity, and subtle pulse animations rather than blue, red, green, or amber.

All design tokens are centralized in `config/datakey.config.ts`.

---

## Core Capabilities

1. **Physical Emergency Scan Page (`/k/[token]`)**:
   - Scanned via QR code or NFC tag on your keychain.
   - Normal mode displays owner identity, emergency medical advisory (blood group, allergies, critical notes), and one-touch masked phone dialer.
   - Built-in anonymous finder message form with real-time GPS location sharing.
   - No finder IP addresses are stored in the database.
   - Protected by Cloudflare Turnstile and Upstash Redis rate limiting.
   - Real-time alerts dispatched to the owner via Telegram Bot and Resend email.

2. **Lost Mode**:
   - Switched exclusively inside the authenticated private vault.
   - Instantly hides all personal medical data and emergency contact numbers at the database layer via a hardened `SECURITY DEFINER` PostgreSQL function.
   - Displays a prominent alert banner to finders with instructions to return the keychain.

3. **Owner Authentication Flow (`/vault/login`)**:
   - **Step 1**: Account Email & Password (via Supabase Auth).
   - **Step 2**: Native TOTP Multi-Factor Authentication (AAL2 verified).
   - **Step 3**: Master Vault Password unwraps the root Vault Encryption Key (VEK) via **Argon2id** (64 MiB RAM, 3 iterations) inside a Web Worker.
   - **Single-Owner Enforcement**: Public account registration is permanently locked after the initial owner account is provisioned.
   - **BIP-39 Recovery Flow**: 24-word recovery phrase can unwrap the VEK and re-wrap it with a new master password with zero re-encryption of vault items.

4. **Zero-Knowledge Private Vault (`/vault`)**:
   - **Credentials & Notes**: Encrypted client-side with AES-256-GCM using single-use keys derived via HKDF-SHA256. The server only receives ciphertext payloads.
   - **File Storage**: Large files are sliced into 2 MiB chunks, encrypted with AES-256-GCM, and uploaded to Cloudflare R2 via presigned URLs. File manifests are stored as encrypted vault records.
   - **Recycle Bin**: 30-day soft-delete retention before database rows and R2 objects are permanently shredded.
   - **Auto-Lock**: Locks automatically after 5 minutes of inactivity or when the browser tab is hidden for more than 2 minutes. Memory buffers are zeroed on lock.

5. **Multi-Part Offline Backup & Standalone Decryptor**:
   - Zero-cloud dependency: Backups are split into authenticated part files (`.manifest.json` and `.part1`, `.part2`, etc.) signed under `k_manifest`.
   - Standalone tool `public/datakey-offline.html` is generated via a build script with zero user data.
   - Runs 100% offline via local `file:///` paths using standard Web Crypto.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router with Turbopack and Proxy)
- **Frontend**: React 19, Tailwind CSS v4 (monochrome design tokens)
- **Database & Auth**: Supabase (PostgreSQL 15+, Row-Level Security requiring AAL2, TOTP MFA)
- **Object Storage**: Cloudflare R2 (S3-compatible, zero egress fees)
- **Rate Limiting**: Upstash Redis (Sliding-window limiter)
- **Bot Protection**: Cloudflare Turnstile
- **Notifications**: Resend (Transactional Email) & Telegram Bot API (Instant Mobile Push)
- **Hosting**: Vercel

---

## Cryptographic Architecture (V2.2)

```
Master Password ─────────────────┐
  │ Argon2id(64MiB, 3 iters)     │
  ▼                               │
KEK_pass ─────── AES-GCM wrap ───┤
                                  │
24-Word Recovery Phrase           │
  │ BIP-39 seed + HKDF-SHA256    │
  ▼                               │
KEK_recov ────── AES-GCM wrap ───┤
                                  ▼
                         VEK (256-bit root)
                                  │
              HKDF-SHA256 domain separation
              ┌───────────┼───────────┼───────────┐
              ▼           ▼           ▼           ▼
          K_record   K_file_master K_export  K_manifest
              │           │
              │           │ AES-GCM wraps per-file FEK
              │           ▼
              │         FEK ──→ AES-256-GCM chunked encryption (2 MiB)
              │
              │ HKDF per-record (random salt + category:recordId)
              ▼
         One-time key ──→ AES-256-GCM record encryption
```

---

## Getting Started

### 1. Prerequisites
- Node.js 20+
- npm 10+

### 2. Clone & Install
```bash
git clone https://github.com/your-username/datakey.git
cd datakey
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local` and provide your development credentials:
```bash
cp .env.example .env.local
```

### 4. Run Test Suites
```bash
# Run base cryptographic tests (29 assertions)
npm run test:crypto

# Run full security, RLS simulation, attack defense & integration suite
npm run test:all
```

### 5. Build Standalone Offline Tool & Release Manifest
```bash
# Build public/datakey-offline.html
npm run build:offline

# Generate and verify cryptographic release manifest
npm run manifest:release
npm run verify:release
```

### 6. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Documentation

- [Beginner User Manual](docs/MANUAL.md) — Plain-English step-by-step guide with diagrams, keychain printing, backup drills, and troubleshooting.
- [Deployment & Operations Guide](docs/DEPLOYMENT.md) — Production setup checklist covering Supabase, R2, Upstash Redis, Resend, Telegram, and Vercel.
- [Security Policy & Threat Model](SECURITY.md) — Threat model, trust boundaries, known limits, and vulnerability reporting.
- [Changelog](CHANGELOG.md) — Version history and release notes.

---

## Security Disclaimer

DataKey relies exclusively on standardized, peer-reviewed cryptographic primitives (AES-256-GCM, Argon2id, BIP-39, HKDF-SHA256). We do not claim custom cryptography, and we never claim this system is unbreakable. An independent third-party security review is strongly recommended before using this software to store mission-critical personal records.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
