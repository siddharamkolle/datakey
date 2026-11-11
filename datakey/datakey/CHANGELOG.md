# Changelog

All notable changes to the DataKey project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] - 2026-11-04

### Added
- **Monochrome Visual Identity**: Complete visual redesign replacing cyan/blue glassmorphism with an Obsidian Black (`#080808`) and Chrome Silver (`#cdcbca`) palette. All states (Lost Mode, warnings, errors, verification) are expressed through icons, border weight, opacity, and subtle pulse animations rather than colors.
- **Centralized Configuration System**: Created `config/datakey.config.ts` holding all tunable application and security parameters with hardcoded safety floors.
- **First-Run Owner Provisioning**: Dynamic first-run registration flow enforcing strong master passwords (>= 14 chars), BIP-39 24-word recovery phrase generation with a 3-word verification challenge, and native Supabase TOTP MFA enrollment.
- **Single-Owner Enforcement**: Public registration is automatically blocked after the first owner account is registered.
- **Web Worker Key Derivation**: Offloaded 64 MiB Argon2id KEK derivation to Web Worker off the main thread to ensure fluid browser responsiveness.
- **Real File Chunking & Cloudflare R2 Integration**: Files are encrypted with AES-256-GCM in 2 MiB chunks, uploaded via presigned URLs to Cloudflare R2, and stored with zero-knowledge encrypted manifests.
- **Hardened PostgreSQL Server Function**: Implemented `get_public_scan_profile(p_token)` with `SECURITY DEFINER` and empty `search_path`, stripping sensitive health fields and contact numbers whenever Lost Mode is active.
- **Real-Time Finder Notifications**: Integrated Telegram Bot API and Resend email alerts with Cloudflare Turnstile bot verification and Upstash Redis rate limiting. Finder IP addresses are strictly excluded from storage.
- **Standalone Offline Recovery Tool**: Created build script `scripts/build-offline-tool.ts` generating `public/datakey-offline.html` for offline zero-network decryption of multi-part backups.
- **Release Integrity Verification**: Added `scripts/generate-release-manifest.ts` and `scripts/verify-release.ts` for cryptographic SHA-256 asset tracking.
- **Comprehensive Test Suite**: Added 37 automated tests covering Known-Answer Vectors, file chunk attacks (reorder, duplicate, drop, cross-file swap), password changes, RLS policy simulation (anon, other user, AAL1 vs AAL2), Lost Mode API privacy, finder abuse, and CSP checks.
- **Documentation**: Added beginner manual (`docs/MANUAL.md`), deployment checklist (`docs/DEPLOYMENT.md`), `SECURITY.md`, and CI/CD GitHub Actions workflow (`.github/workflows/ci.yml`).

### Changed
- Replaced mock in-memory data store with real Supabase PostgreSQL integration and Row-Level Security policies requiring AAL2.
- Updated Next.js 16 Proxy convention (`src/proxy.ts`) with cryptographic nonce generation and strict Content Security Policy.
- Removed `/avatar-shashank.png` dependency; avatar is optional and dynamically rendered from owner initials.
- Replaced fake Bengaluru GPS fallback coordinates with true browser geolocation permissions handling.
- Removed demo Lost Mode toggle from public scan page; Lost Mode can only be toggled inside the authenticated vault.

### Removed
- Removed hardcoded credentials and fake autofill values (`123456`, demo accounts) from login forms.
- Removed simulated file upload timers and static mock arrays.

