# DataKey

> **Personal Public View Hub & Simple Zero-Knowledge Encrypted Vault**

DataKey combines a customizable **Personal Public View** (first page `/` and QR link `/k/[token]`) with a client-side encrypted **Private Vault** protected by a single **Master Password** and an optional downloadable **Recovery Key** file — with **zero paid subscriptions** required.

---

## Visual Identity: Obsidian & Chrome Silver

DataKey uses a strict monochrome frosted-glass design system:
- **Obsidian Black (`#080808`)** background & surfaces
- **Chrome Silver (`#cdcbca`)** text, borders, icons, and QR codes

---

## Core Flow (Simple & Clean)

1. **First Page (`/` and `/k/[token]`) — Personal Public View + Master Login**:
   - Displays your customizable Personal Public View: name, tagline, location, bio, call/email buttons, custom personal links, optional medical advisory & emergency contacts, message + GPS location form, and QR code.
   - Includes a prominent **Master Login** button in the top bar.
   - When **Lost Mode** is turned on inside the vault, sensitive contact/medical/link fields are stripped server-side and replaced with a Lost Mode banner and finder message form.

2. **Master Login (`/vault/login`) — Simple Cryptography**:
   - **First-Time Setup**: Choose one **Master Password** (min 8 characters). Optionally download your `datakey-recovery-key.json` backup key file.
   - **Returning Login**: Enter your single **Master Password** to derive your key (`PBKDF2-SHA256`), authenticate via signed `HttpOnly` session cookie, and unwrap your 256-bit Vault Encryption Key (`AES-256-GCM`) in volatile memory.
   - **Recovery**: Upload or paste your `datakey-recovery-key.json` file to unlock and reset your Master Password without losing encrypted records.

3. **Private Vault (`/vault`)**:
   - **Public View**: Dedicated editor to customize everything shown on the first page (name, tagline, bio, avatar, location, phone, email, custom links, medical fields, emergency contacts, message form, QR code, and visibility toggles).
   - **Passwords & Logins**: AES-256-GCM encrypted credentials with search, category filter, reveal/mask, edit, and 30-second clipboard clear notice.
   - **Confidential Notes**: Encrypted notes with tags and full edit/copy support.
   - **Encrypted Files**: Files encrypted client-side in chunks and stored directly in your database.
   - **Emergency & Lost Mode**: One-click Lost Mode toggle and lost alert banner settings.
   - **Finder Transmissions**: Messages & GPS locations submitted from the first page.
   - **Recycle Bin**: Soft-delete recovery or permanent shredding.
   - **Security & Recovery**: Change Master Password or generate a fresh Recovery Key file anytime.
   - **Offline Backup & Tool**: Multi-part backup export + standalone `public/datakey-offline.html` decryptor.

---

## 100% Free Database Support (No Subscriptions)

DataKey never relies on browser `localStorage` for vault/public persistence — it uses a real relational SQL database:
- **Default (Zero Config)**: Built-in **SQLite** (`./data/datakey.db` via Node's native `node:sqlite`) — works immediately with zero accounts or `.env` files.
- **Free Cloud SQLite (Serverless / Vercel)**: Set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (Turso free tier, no credit card, never pauses).
- **Free PostgreSQL**: Set `DATABASE_URL` (Neon, Supabase Postgres, Render, Railway, or local Postgres).

---

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Tests & Production Build

```bash
npm run test:crypto
npm run test
npm run lint
npm run build
```
