# DataKey User Manual (V2.2)

Welcome to **DataKey**. This manual is written in plain, simple English. Short sentences. No confusing computer jargon without an immediate explanation.

---

## 1. What DataKey Does

DataKey is a private digital safe for your passwords, confidential notes, and sensitive files. It also connects to a physical QR code on your keychain so people can return your keys or contact your family in an emergency.

Here is a simple diagram showing how it works:

```
                  +----------------------------------------------+
                  |               YOUR PHYSICAL KEYCHAIN         |
                  |         (Printed QR Code + Short Web Link)   |
                  +----------------------------------------------+
                                         |
                                         | Scanned by Finder / EMT
                                         v
+---------------------------------------------------------------------------------+
|                                 1. PUBLIC SCAN PAGE                             |
|  - If normal: Shows owner name, masked call button, emergency medical advisory. |
|  - If LOST MODE is ON: Strips all medical notes & contacts. Shows message form.  |
|  - Anonymous message form: Sends GPS location directly to you via Telegram.    |
+---------------------------------------------------------------------------------+
                                         |
                                         | Owner enters credentials
                                         v
+---------------------------------------------------------------------------------+
|                                 2. OWNER LOGIN                                  |
|  Step 1: Account Email & Password.                                              |
|  Step 2: 6-digit Authenticator app code (TOTP Multi-Factor Authentication).     |
|  Step 3: Master Vault Password (derives key to unlock data inside your browser).|
+---------------------------------------------------------------------------------+
                                         |
                                         | Unwrapped only in computer memory
                                         v
+---------------------------------------------------------------------------------+
|                                3. PRIVATE VAULT                                 |
|  - Passwords & Logins: Encrypted with AES-256-GCM. Server never sees plaintext. |
|  - Confidential Notes: Encrypted records with single-use keys.                  |
|  - Files: Partitioned into 2 MiB chunks, encrypted, stored on Cloudflare R2.    |
|  - Lost Mode Switch: One-click emergency concealment for physical keychains.   |
|  - Offline Backup Tool: Self-contained tool that restores data without internet.|
+---------------------------------------------------------------------------------+
```

---

## 2. Who Sets the Username and Password? (First-Run Setup)

You set your own account and passwords during the **First-Run Setup**.

### Step 1: Open the App for the First Time
1. Go to your DataKey website address (e.g., `https://datakey.app/vault/login`).
2. If this is your first time, the screen displays **DataKey Setup: Initial First-Run Vault Provisioning**.

### Step 2: Choose Your Two Passwords
You will be asked for three items:
1. **Your Email**: Used for account notifications and password reset emails.
2. **Account Password**: Used for standard server login (minimum 12 characters).
3. **Master Vault Password**: Used to encrypt your private safe (minimum 14 characters).

> **CRITICAL RULE**: Your **Account Password** and your **Master Password** must **NOT** be the same. The app will reject identical passwords.
> 
> *Why?* Your Account Password verifies who you are to the server. Your Master Password stays inside your browser and decrypts your data. If someone steals your server login, they still cannot read your vault without your Master Password.

### Step 3: Save Your 24-Word Recovery Phrase
1. The app generates 24 English words from the BIP-39 standard (a widely used system for generating secure keys).
2. Write these 24 words down with a pencil on paper. Do not take a screenshot. Do not store them in your email.
3. The app will ask you to confirm three random words (for example: Word #4, Word #11, and #19) to prove you wrote them down.
4. Once verified, the app creates your encrypted cryptographic envelope.

### Step 4: Set Up Your Authenticator App
1. The app displays a QR code on your screen.
2. Open an authenticator app on your phone (such as **Google Authenticator**, **Aegis**, or **1Password**).
3. Scan the QR code.
4. Type the 6-digit number shown on your phone into DataKey to activate it.

### Step 5: How Public Sign-Up Is Turned Off
Once your owner account is created, the system checks the database and sees 1 owner already exists. **Public sign-up is immediately turned off.** No stranger can ever create an account on your website.

---

## 3. How to Change Passwords and Authenticator App

### How to Change Your Account Password
1. If you forget your account password, click **"Forgot password?"** on the login page.
2. A reset link is sent to your email.
3. *Note*: Resetting your account password restores your website access, but it **never** decrypts your vault.

### How to Change Your Master Password
1. Log into your private vault.
2. If you remember your current Master Password, you can re-wrap your key with a new Master Password in Settings.
3. If you forgot your Master Password, click **"Use 24-Word Recovery Phrase"** on the login screen.
4. Type your 24 words and set a new Master Password (at least 14 characters).

### How to Reset Your Authenticator App
If you switch phones:
1. Use your backup recovery codes or log into Supabase to unenroll the old factor and scan a new QR code.

### Where to Keep Your Backup Codes and 24 Words
Keep your paper copy in a fireproof home safe or a bank safe deposit box. Never upload photos of your 24 words to Google Drive, iCloud, or Slack.

---

## 4. Cryptography Settings in Simple Words

All settings are configured in `config/datakey.config.ts`. Here is what they mean:

| Setting | Plain-English Meaning | Safe Default | Safe Minimum (Floor) |
|---|---|---|---|
| `argon2id.memoryKiB` | How much computer memory (RAM) is required to test a password guess. This stops hackers using high-speed graphics cards (GPUs) to guess your password. | 65,536 KiB (64 MiB) | 16,384 KiB (16 MiB) |
| `argon2id.iterations` | How many calculation passes are run. | 3 passes | 2 passes |
| `minMasterPasswordLength` | Shortest allowed Master Password. | 14 characters | 14 characters |
| `autoLockMinutes` | How many minutes of inactivity before your vault locks itself and wipes computer memory. | 5 minutes | 1 minute |
| `recycleBinRetentionDays` | How many days deleted items sit in the Recycle Bin before permanent shredding. | 30 days | 1 day |
| `chunkSizeBytes` | How large each file slice is when encrypting documents. | 2 MiB | 64 KiB |

### What Happens if You Change These?
- Increasing `argon2id.memoryKiB` makes your vault even stronger against supercomputers, but login will take 1 or 2 seconds longer on older phones.
- **What must NEVER be changed**: Never reduce `memoryKiB` below 16,384 or password length below 14. The system has hard safety floors and will refuse to run if you lower them.

---

## 5. How to Edit the Public Page & Keychain QR

### Which Fields Can Strangers See?
Inside your vault, go to the **"Emergency & Lost Mode"** tab. You have individual checkboxes:
- **Owner Name**: Turn on to let finders know who owns the item.
- **Masked Phone Button**: Lets finders click to call your phone without revealing your full raw number in plain text.
- **Blood Group, Allergies, Medical Notes**: Keep off by default. Turn on only if you want paramedics to see them in an emergency.

### How to Add or Remove Emergency Contacts
In the database or vault controls, add your family member's name and telephone number. You can designate priority order (Priority 1, 2, 3).

### How to Use Lost Mode
1. If you leave your keys in a taxi or coffee shop, open DataKey on your phone and log in.
2. Click **"Enable Lost Mode"**.
3. *What changes immediately*: The public page now displays a prominent **"KEYCHAIN REPORTED LOST"** banner. The server strips all medical notes and emergency contact phone numbers. Only your emergency return instructions and an anonymous message form are displayed.
4. When you get your keys back, click **"Disable Lost Mode"** inside your vault.

---

## 6. How to Print and Test Your Physical QR Keychain

1. In your vault, your unique 16-character public token is shown (e.g. `k/ab87f92kc9102xza`).
2. Download or print the monochrome QR code displayed on the page.
3. **Always write the short link under the QR code**: For example, print:
   ```
   [ QR CODE IMAGE ]
   datakey.app/k/ab87f92kc9102xza
   ```
   *Why?* If the printed QR code gets scratched or wet, a finder can still type the short address into their web browser.
4. **Test it before attaching to your keys**: Turn off Wi-Fi on your phone, open your normal camera, scan the QR code. Make sure it opens your public scan page. Test sending a message from the form to verify your Telegram alert arrives.

---

## 7. How to Change Colors and Branding

DataKey uses a strict **monochrome palette**:
- Background: **Obsidian Black (`#080808`)**
- Accents & Text: **Chrome Silver (`#cdcbca`)**

To change these colors across the entire application:
1. Open `config/datakey.config.ts`.
2. Locate `visualIdentity.colors`.
3. Change the hex values. All buttons, glass panels, borders, and QR codes automatically update to your new colors.

---

## 8. Backups: How to Make an Offline Backup

### How to Create an Offline Backup
1. Log into your private vault.
2. Go to the **"Offline Backup & Tool"** tab.
3. Click **"Download datakey-offline.html"** (this is your standalone decryptor tool). Save it to an external USB flash drive.
4. Click **"Generate & Download Backup"**. This downloads:
   - `datakey-backup-YYYY-MM-DD.manifest.json` (the encrypted file list)
   - `datakey-backup-YYYY-MM-DD.part1`, `.part2`, etc. (the encrypted parts)

### How Often to Back Up
- Make a new backup **once a month**, or immediately after adding important files (like passport scans or deed documents).

### Where to Store Your Two Copies
- **Copy 1**: On an encrypted USB flash drive kept in your home safe.
- **Copy 2**: On a second USB flash drive kept at a separate location (such as an office desk or a trusted relative's safe).

### How to Restore Offline (Without Internet)
1. Double-click `datakey-offline.html` on any computer. It opens directly from your file drive (`file:///...`).
2. Click **"Select Backup Manifest & Parts"** and select your `.manifest.json` and `.part` files.
3. Type your Master Password or your 24-word recovery phrase.
4. Click **"Authenticate & Decrypt Backup"**.
5. The tool verifies each part, reassembles your safe, and displays your records directly on screen.

### Quarterly Restore Drill Checklist
Every 3 months, run this 5-minute test:
- [ ] Take your USB drive to a computer disconnected from Wi-Fi.
- [ ] Open `datakey-offline.html`.
- [ ] Load your latest backup files.
- [ ] Type your Master Password and verify you can view a password and a note.
- [ ] If successful, mark the date in your calendar for your next quarterly drill.

---

## 9. Maintenance Checklist

### Weekly
- [ ] Check Finder Transmissions tab in your vault for any unexpected alerts.
- [ ] Empty Recycle Bin if you have shredded sensitive passwords.

### Monthly
- [ ] Download a fresh offline multi-part backup.
- [ ] Check that your Authenticator app is backed up on your phone.

### Quarterly
- [ ] Run your offline restore drill using `datakey-offline.html`.
- [ ] Review emergency contacts and update any changed phone numbers.

### Updating Dependencies Safely
1. Run `npm audit` to check for security advisories.
2. Run `npm test:all` to make sure all 37 cryptographic and security tests pass.
3. Run `npm run manifest:release` and `npm run verify:release` to verify file integrity.

---

## 10. What to Do If... (Emergency Incident Response)

### What to Do If Your Phone Is Lost
1. Go to any trusted computer (work laptop or desktop).
2. Log into DataKey using your email, account password, and one of your saved backup MFA recovery codes.
3. In the vault, go to **"Active Sessions"** and click **"Sign Out Session"** to disconnect your lost phone immediately.
4. Go to Supabase dashboard and re-enroll your new phone's authenticator app.

### What to Do If Your Keychain Is Lost
1. Open DataKey from your phone or laptop.
2. Go to **"Emergency & Lost Mode"** and click **"Enable Lost Mode"**.
3. All sensitive details are hidden. When anyone scans your keys, you will receive their message and GPS location on Telegram and email.

### What to Do If You Forget Your Master Password
1. On the login screen, click **"Forgot Master Password? Use 24-Word Recovery Phrase"**.
2. Type your 24 words.
3. Choose a new Master Password (at least 14 characters).
4. The system unwraps your vault and re-wraps it with your new password. All your records remain safe.

### What to Do If BOTH Master Password AND 24 Words Are Lost
> **HONEST WARNING**: If you lose both your Master Password AND your 24-word recovery phrase, **YOUR VAULT DATA IS PERMANENTLY GONE**.
> 
> Because DataKey uses true zero-knowledge cryptography, no server, company, or engineer holds a master key. There is no backdoor. We cannot recover your data for you. This is why keeping your paper 24-word phrase safe is essential.

### What to Do If the Host or Vercel Is Down
- Your data is never trapped in the cloud. Plug in your USB drive, open `datakey-offline.html`, and decrypt your local backup files. You have full offline access to all your passwords and notes.

### What to Do If You Suspect a Data Breach
1. Change your Account Password via the website login.
2. Open your vault and change your Master Password.
3. Check **"Finder Transmissions"** and **"Active Sessions"** to verify no unauthorized devices are connected.

---

## 11. Troubleshooting Table

| Problem | Cause | How to Fix |
|---|---|---|
| "Incorrect master password or corrupted envelope" | A typo in your Master Password, or caps lock is turned on. | Carefully re-type your Master Password. Check caps lock. If still failing, use your 24-word recovery phrase. |
| "Invalid 6-digit TOTP code" | Your phone clock is out of sync by a few seconds. | In your phone settings, toggle "Set Time Automatically" on. Authenticator codes rely on exact clock time. |
| "Rate limit exceeded" | More than 5 finder submissions or login attempts in a short window. | Wait 15 minutes for the rate limit timer to reset. |
| "Word # does not match" | The word typed during the 24-word setup challenge has a spelling mistake. | Check the official BIP-39 English wordlist. All words are lowercase English words between 3 and 8 letters. |
| GPS location not showing on finder alert | Finder clicked "Don't Allow" on their phone browser's location prompt. | The system still delivers their message text. DataKey respects finder privacy and never forces fake coordinates. |

---

## 12. Glossary of Terms in Simple Words

- **AES-256-GCM**: Advanced Encryption Standard with 256-bit keys and Galois/Counter Mode. A military-grade standard used worldwide to make data unreadable without the right key.
- **Argon2id**: A specialized mathematical formula designed to convert passwords into encryption keys. It intentionally uses 64 megabytes of computer RAM so hackers cannot use fast graphics cards to guess your password.
- **BIP-39**: Bitcoin Improvement Proposal #39. A standard list of 2,048 simple English words used to create human-readable backup phrases.
- **CSPRNG**: Cryptographically Secure Pseudo-Random Number Generator. A digital random number generator with no predictable patterns.
- **HttpOnly Cookie**: A secure web cookie that browser scripts cannot touch, protecting your login session from website hackers.
- **KEK (Key Encryption Key)**: A key derived from your password used to wrap and unwrap your vault key.
- **Lost Mode**: An emergency setting in DataKey that hides your personal details and shows an alert banner when your keychain is missing.
- **MFA (Multi-Factor Authentication)**: Requiring two different proofs of who you are (your password + a 6-digit code from your phone).
- **Nonce / IV**: A unique number used only once during encryption so two identical passwords do not look identical when stored.
- **RLS (Row-Level Security)**: A database feature in PostgreSQL that checks who is asking before returning any row of data.
- **TOTP**: Time-based One-Time Password. The 6-digit number that changes every 30 seconds on your phone's authenticator app.
- **VEK (Vault Encryption Key)**: The secret 256-bit master key that unlocks your safe. It lives only in volatile computer RAM while your vault is open.
- **Zero-Knowledge**: A security design where the server only holds scrambled ciphertext and never knows your passwords or encryption keys.

