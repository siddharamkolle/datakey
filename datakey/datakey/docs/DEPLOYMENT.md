# DataKey Deployment & Operations Guide (Architecture V2.2)

This guide walks you through deploying DataKey to production step-by-step with checkboxes.

---

## Pre-Deployment Requirements & Service Accounts

Before starting, prepare accounts for the following services (free tiers are available for all):

- [ ] **GitHub**: To host your private repository.
- [ ] **Supabase**: PostgreSQL database and Auth with TOTP MFA.
- [ ] **Cloudflare R2**: Object storage for zero-egress encrypted file chunks.
- [ ] **Upstash Redis**: Serverless Redis for sliding-window rate limiting.
- [ ] **Cloudflare Turnstile**: Free, privacy-respecting bot protection on the public scan page.
- [ ] **Resend**: Transactional email API for instant finder notifications.
- [ ] **Telegram Bot**: Free instant push alerts to your smartphone when a finder scans your keychain.
- [ ] **Vercel**: Next.js hosting platform with Edge runtime and HTTPS.

---

## Step 1: Create GitHub Repository & Push

- [ ] Create a new private repository on GitHub (e.g. `your-username/datakey`).
- [ ] Verify your `.gitignore` covers `.env*`, `node_modules`, `.next`, `dist`, `datakey-backup*`, and `*.part*`.
- [ ] Initialize and push your repository:
  ```bash
  git add .
  git commit -m "feat: complete DataKey V2.2 production build"
  git branch -M main
  git remote add origin https://github.com/your-username/datakey.git
  git push -u origin main
  ```

---

## Step 2: Supabase Project Setup & Database Migrations

1. **Create Supabase Project**:
   - [ ] Log into [Supabase Dashboard](https://supabase.com).
   - [ ] Click **"New Project"**. Choose your preferred region and database password.
2. **Apply Database Migration**:
   - [ ] In the Supabase Dashboard, go to the **SQL Editor**.
   - [ ] Open the file `supabase/migrations/20261104000000_datakey_schema.sql` from this repository.
   - [ ] Paste its entire contents into the SQL Editor and click **Run**.
   - [ ] Verify all 6 tables and hardened server functions are created:
     - `vault_folders`
     - `vault_envelopes`
     - `vault_records`
     - `public_profiles`
     - `public_emergency_contacts`
     - `finder_transmissions`
     - Function `get_public_scan_profile(p_token)`
     - Function `check_registration_allowed()`
     - Function `purge_expired_retention(retention_days)`
3. **Configure Authentication Settings**:
   - [ ] Go to **Authentication -> Providers -> Email**. Ensure email signups are enabled.
   - [ ] Go to **Authentication -> Multi-Factor (MFA)**. Enable **TOTP**.
   - [ ] Copy the following credentials from **Project Settings -> API**:
     - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public key` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role secret key` -> `SUPABASE_SERVICE_ROLE_KEY` (KEEP SECRET)

---

## Step 3: Cloudflare R2 Object Storage & CORS Setup

1. **Create R2 Bucket**:
   - [ ] Log into [Cloudflare Dashboard](https://dash.cloudflare.com) and navigate to **R2**.
   - [ ] Click **Create bucket**. Name it `datakey-vault-storage` (or your choice). Set location to Automatic.
2. **Create API Tokens**:
   - [ ] On the R2 overview page, click **Manage R2 API Tokens**.
   - [ ] Click **Create API token**. Set Permissions to **Object Read & Write**.
   - [ ] Copy the generated:
     - `Account ID` -> `R2_ACCOUNT_ID`
     - `Access Key ID` -> `R2_ACCESS_KEY_ID`
     - `Secret Access Key` -> `R2_SECRET_ACCESS_KEY`
3. **Configure CORS Policy on the Bucket**:
   - [ ] In bucket **Settings -> CORS Policy**, click **Add CORS Policy** and paste:
     ```json
     [
       {
         "AllowedOrigins": [
           "https://datakey.app",
           "https://vault.datakey.app",
           "http://localhost:3000"
         ],
         "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
         "AllowedHeaders": ["*"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

---

## Step 4: Upstash Redis (Rate Limiting)

1. [ ] Log into [Upstash Console](https://console.upstash.com).
2. [ ] Click **Create Database**. Name it `datakey-ratelimit`.
3. [ ] Under **REST API**, copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## Step 5: Cloudflare Turnstile (Bot Protection)

1. [ ] In Cloudflare Dashboard, go to **Turnstile**.
2. [ ] Click **Add Site**. Set Domain to your custom domain (and `localhost` for testing).
3. [ ] Set Widget Mode to **Managed**.
4. [ ] Copy:
   - `Site Key` -> `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `Secret Key` -> `TURNSTILE_SECRET_KEY`

---

## Step 6: Resend & Telegram Notifications

1. **Resend (Email)**:
   - [ ] Log into [Resend](https://resend.com) and create an API Key -> `RESEND_API_KEY`.
   - [ ] Verify your sending domain (e.g., `alerts@datakey.app`) -> `RESEND_FROM_EMAIL`.
   - [ ] Set `OWNER_NOTIFICATION_EMAIL` to your personal email address.
2. **Telegram Bot (Instant Push)**:
   - [ ] Open Telegram and message `@BotFather`. Send `/newbot` and follow prompts.
   - [ ] Copy the HTTP API token -> `TELEGRAM_BOT_TOKEN`.
   - [ ] Message `@userinfobot` in Telegram to get your numeric ID -> `TELEGRAM_CHAT_ID`.
   - [ ] Send a test message `/start` to your new bot.

---

## Step 7: Vercel Deployment

1. **Import Project into Vercel**:
   - [ ] Log into [Vercel](https://vercel.com). Click **Add New -> Project**.
   - [ ] Select your `datakey` GitHub repository.
2. **Configure Environment Variables**:
   Add every variable from `.env.example` in the Vercel dashboard under **Settings -> Environment Variables**:

   | Variable Name | Environment | Sensitive (Hidden) |
   |---|---|---|
   | `NEXT_PUBLIC_APP_URL` | Production, Preview | No |
   | `NEXT_PUBLIC_DOMAIN` | Production, Preview | No |
   | `NEXT_PUBLIC_SUPABASE_URL` | All | No |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | No |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production | **YES** |
   | `R2_ACCOUNT_ID` | Production | **YES** |
   | `R2_ACCESS_KEY_ID` | Production | **YES** |
   | `R2_SECRET_ACCESS_KEY` | Production | **YES** |
   | `R2_BUCKET_NAME` | All | No |
   | `UPSTASH_REDIS_REST_URL` | Production | **YES** |
   | `UPSTASH_REDIS_REST_TOKEN` | Production | **YES** |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`| All | No |
   | `TURNSTILE_SECRET_KEY` | Production | **YES** |
   | `RESEND_API_KEY` | Production | **YES** |
   | `RESEND_FROM_EMAIL` | Production | No |
   | `OWNER_NOTIFICATION_EMAIL` | Production | **YES** |
   | `TELEGRAM_BOT_TOKEN` | Production | **YES** |
   | `TELEGRAM_CHAT_ID` | Production | **YES** |

3. **Deploy**:
   - [ ] Click **Deploy**. Vercel will build the project using Turbopack and deploy to your assigned URL.

---

## Step 8: Custom Domains & Security Headers

1. **Domain Setup**:
   - [ ] Connect your primary domain (e.g. `datakey.app`).
   - [ ] Recommended: Set up a dedicated subdomain for the vault (e.g. `vault.datakey.app`).
2. **Verify Security Headers**:
   - [ ] DataKey's `src/proxy.ts` automatically applies:
     - Strict Content Security Policy with cryptographic nonces.
     - `X-Frame-Options: DENY` (prevents clickjacking).
     - `X-Content-Type-Options: nosniff` (prevents MIME sniffing).
     - `Referrer-Policy: strict-origin-when-cross-origin`.
     - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`.

---

## Step 9: Post-Deployment Verification Checklist

Run these 5 tests immediately after deployment:

- [ ] **1. First-Run Owner Registration**:
  - Open `/vault/login`.
  - Verify "DataKey Setup: Initial First-Run Vault Provisioning" appears.
  - Complete owner registration, save your 24 words, pass the challenge, and scan your TOTP QR code.
  - Open an incognito browser window and go to `/vault/login`. Verify that sign-up is now disabled.
- [ ] **2. Row-Level Security (RLS) Verification**:
  - Run `npm run test:all` locally to verify anonymous rejection and AAL2 policy enforcement.
- [ ] **3. Lost Mode Live Test**:
  - Open your vault dashboard, go to "Emergency & Lost Mode", and click "Enable Lost Mode".
  - Open your public scan link `/k/<token>` in an incognito window.
  - Verify the "KEYCHAIN REPORTED LOST" banner appears and no personal medical notes or emergency phone numbers are returned.
- [ ] **4. Finder Notification Test**:
  - From the public scan page, type a test message: `"Testing finder notification from deployment."`
  - Click "Send Notification".
  - Verify the notification arrives on your Telegram bot and your email inbox within 5 seconds.
  - Check the "Finder Transmissions" tab in your vault to verify the message appears without an IP address.
- [ ] **5. Offline Backup & Restore Test**:
  - In your vault, click "Offline Backup & Tool".
  - Download `datakey-offline.html` and your backup parts.
  - Disconnect your computer from Wi-Fi.
  - Open `datakey-offline.html` locally in your browser, load your backup parts, enter your Master Password, and verify your records decrypt.

---

## Step 10: Independent Off-Site Backup Plan

Do not rely exclusively on Supabase or Cloudflare. Maintain independent weekly backups:

1. **Database Snapshot**:
   - In Supabase Dashboard, go to **Database -> Backups** to download scheduled PostgreSQL dumps.
   - Or run a periodic `pg_dump` via GitHub Actions or a local cron job to an independent storage location (e.g., an encrypted AWS S3 or local NAS).
2. **File Chunk Backup**:
   - Use the AWS CLI or `rclone` with your R2 credentials to mirror your R2 bucket to an independent destination:
     ```bash
     rclone sync r2:datakey-vault-storage /path/to/local/backup/
     ```
3. **Vault Offline Multi-Part Backups**:
   - Download your multi-part backup from the vault dashboard once a month and copy it to two separate USB flash drives.

