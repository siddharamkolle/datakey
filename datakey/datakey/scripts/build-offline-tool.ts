/**
 * DataKey Offline Decryption Tool Builder
 * Generates public/datakey-offline.html as a self-contained, zero-network HTML5 application.
 * Runs entirely locally via file:/// URLs using standard Web Crypto (PBKDF2, HKDF, AES-256-GCM).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const OUT_PATH = path.join(process.cwd(), "public", "datakey-offline.html");

const offlineToolHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DataKey Standalone Offline Decryptor</title>
  <style>
    :root {
      --bg: #080808;
      --silver: #cdcbca;
      --silver-secondary: rgba(205, 203, 202, 0.75);
      --silver-muted: rgba(205, 203, 202, 0.45);
      --border: rgba(205, 203, 202, 0.20);
      --surface: rgba(205, 203, 202, 0.05);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--silver);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 2rem 1rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .container {
      width: 100%;
      max-width: 720px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 12px 36px rgba(0,0,0,0.8);
    }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { font-size: 0.8rem; color: var(--silver-muted); margin-bottom: 1.5rem; }
    .section { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; }
    input[type="file"], input[type="password"], textarea {
      width: 100%;
      background: rgba(0,0,0,0.5);
      border: 1px solid var(--border);
      color: var(--silver);
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-family: monospace;
      outline: none;
    }
    input:focus, textarea:focus { border-color: var(--silver); }
    button {
      width: 100%;
      background: rgba(205, 203, 202, 0.15);
      border: 1px solid var(--border);
      color: var(--silver);
      padding: 0.85rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { background: rgba(205, 203, 202, 0.25); border-color: var(--silver); }
    .status { margin-top: 1rem; font-size: 0.8rem; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border); display: none; }
    .records-list { margin-top: 1.5rem; max-height: 500px; overflow-y: auto; }
    .record-card {
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 0.75rem;
      font-size: 0.8rem;
    }
    .record-title { font-weight: 700; margin-bottom: 0.35rem; }
    .record-field { margin-top: 0.25rem; font-family: monospace; word-break: break-word; white-space: pre-wrap; color: var(--silver-secondary); }
  </style>
</head>
<body>
  <div class="container">
    <h1>DataKey Standalone Offline Decryptor</h1>
    <p class="subtitle">Zero Network Dependencies • Runs locally via file:/// • PBKDF2-SHA256 + HKDF + AES-256-GCM</p>

    <div class="section">
      <label>1. Select Backup Manifest &amp; Parts (.manifest.json and .part1, .part2...):</label>
      <input type="file" id="backupFiles" multiple accept=".json,.part*">
      <div id="fileSummary" style="font-size: 0.75rem; color: var(--silver-muted); margin-top: 0.5rem;"></div>
    </div>

    <div class="section">
      <label>2. Master Password OR Recovery Key (DK-...):</label>
      <input type="password" id="vaultKeyInput" placeholder="Enter Master Password or paste DK-XXXX-... Recovery Key">
    </div>

    <button id="decryptBtn" onclick="runOfflineDecryption()">Decrypt Backup Offline</button>

    <div id="statusBox" class="status"></div>
    <div id="resultsContainer" class="records-list"></div>
  </div>

  <script>
    let manifestData = null;
    let partFiles = [];

    document.getElementById('backupFiles').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      manifestData = null;
      partFiles = [];

      for (const file of files) {
        if (file.name.includes('.manifest.json') || file.name.endsWith('.json')) {
          try {
            manifestData = JSON.parse(await file.text());
          } catch (err) {
            console.error('Invalid manifest JSON:', err);
          }
        } else if (file.name.includes('.part')) {
          partFiles.push(file);
        }
      }

      document.getElementById('fileSummary').innerText =
        \`Loaded: \${manifestData ? '1 Manifest ✓' : '0 Manifests'} | \${partFiles.length} Part File(s)\`;
    });

    function fromBase64(b64) {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    function fromHex(hex) {
      const m = hex.match(/.{1,2}/g) || [];
      return new Uint8Array(m.map((b) => parseInt(b, 16)));
    }

    async function sha256Hex(bytes) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    async function hkdfDerive(ikmBytes, saltBytes, infoStr) {
      const key = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: new TextEncoder().encode(infoStr) },
        key,
        256
      );
      return new Uint8Array(bits);
    }

    async function aesGcmDecrypt(rawKey, ivBytes, cipherBytes, aadStr) {
      const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
      const buf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes, additionalData: new TextEncoder().encode(aadStr), tagLength: 128 },
        key,
        cipherBytes
      );
      return new Uint8Array(buf);
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    async function runOfflineDecryption() {
      const status = document.getElementById('statusBox');
      const results = document.getElementById('resultsContainer');
      status.style.display = 'block';
      results.innerHTML = '';

      if (!manifestData || partFiles.length === 0) {
        status.innerText = 'Error: Please select both the .manifest.json file and all .part files.';
        return;
      }

      const secret = document.getElementById('vaultKeyInput').value.trim();
      if (!secret) {
        status.innerText = 'Error: Master Password or Recovery Key is required.';
        return;
      }

      status.innerText = 'Verifying part hashes and deriving decryption keys...';

      try {
        partFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        const partChunks = [];
        let totalLen = 0;
        for (let i = 0; i < partFiles.length; i++) {
          const parsed = JSON.parse(await partFiles[i].text());
          const bytes = fromBase64(parsed.data_base64);
          const actualHash = await sha256Hex(bytes);
          if (parsed.part_sha256 && parsed.part_sha256 !== actualHash) {
            throw new Error('Backup part integrity mismatch (tampered or corrupted file).');
          }
          if (manifestData.part_hashes && manifestData.part_hashes[i] && manifestData.part_hashes[i] !== actualHash) {
            throw new Error('Part hash does not match manifest.');
          }
          partChunks.push(bytes);
          totalLen += bytes.length;
        }

        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of partChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        const payload = JSON.parse(new TextDecoder().decode(merged));
        if (!payload.envelope || !Array.isArray(payload.records)) {
          throw new Error('Unsupported backup format.');
        }

        const env = payload.envelope;
        const kv = env.key_version || 1;
        let vek = null;

        // Try Recovery Key if input looks like DK-... or JSON recovery key
        let maybeRecov = secret;
        if (maybeRecov.startsWith('{')) {
          try { maybeRecov = JSON.parse(maybeRecov).recovery_key || maybeRecov; } catch {}
        }
        const cleanedRecov = maybeRecov.replace(/^DK-/i, '').replace(/[\\s-]+/g, '').toLowerCase();

        if (/^[0-9a-f]{64}$/.test(cleanedRecov) && env.wrapped_vek_recov) {
          const rawRecov = fromHex(cleanedRecov);
          const kekRecov = await hkdfDerive(
            rawRecov,
            new TextEncoder().encode('datakey/simple/v1/recov-salt'),
            'datakey/simple/v1/recov-kek'
          );
          vek = await aesGcmDecrypt(
            kekRecov,
            fromBase64(env.iv_recov),
            fromBase64(env.wrapped_vek_recov),
            \`datakey:simple:v\${kv}:recov\`
          );
        } else {
          // Derive KEK_pass via PBKDF2-SHA256
          const baseKey = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            'PBKDF2',
            false,
            ['deriveBits']
          );
          const bits = await crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: fromBase64(env.salt),
              iterations: env.kdf_iterations || 600000,
              hash: 'SHA-256',
            },
            baseKey,
            512
          );
          const kekPass = new Uint8Array(bits).slice(0, 32);
          vek = await aesGcmDecrypt(
            kekPass,
            fromBase64(env.iv_pass),
            fromBase64(env.wrapped_vek_pass),
            \`datakey:simple:v\${kv}:pass\`
          );
        }

        const kRecord = await hkdfDerive(
          vek,
          new TextEncoder().encode('datakey/v2.2/subkeys-salt'),
          'datakey/v2.2/records'
        );

        let decryptedCount = 0;
        const userId = payload.user_id || 'owner';

        for (const rec of payload.records) {
          const salt = fromBase64(rec.salt);
          const nonce = fromBase64(rec.nonce);
          const cipher = fromBase64(rec.ciphertext);
          const tag = fromBase64(rec.auth_tag);
          const combined = new Uint8Array(cipher.length + tag.length);
          combined.set(cipher, 0);
          combined.set(tag, cipher.length);

          const oneTimeKey = await hkdfDerive(kRecord, salt, \`\${rec.category}:\${rec.record_id}\`);
          const aad = \`\${userId}:\${rec.record_id}:\${rec.category}:\${rec.key_version}:v2.2\`;
          const plainBytes = await aesGcmDecrypt(oneTimeKey, nonce, combined, aad);
          const obj = JSON.parse(new TextDecoder().decode(plainBytes));
          decryptedCount++;

          const card = document.createElement('div');
          card.className = 'record-card';
          if (rec.category === 'login') {
            card.innerHTML = \`
              <div class="record-title">[LOGIN] \${escapeHtml(obj.title)} (\${escapeHtml(obj.category || 'Other')})</div>
              <div class="record-field">Username: \${escapeHtml(obj.username || '—')}</div>
              <div class="record-field">Password: \${escapeHtml(obj.password || '')}</div>
              \${obj.url ? \`<div class="record-field">URL: \${escapeHtml(obj.url)}</div>\` : ''}
            \`;
          } else if (rec.category === 'note') {
            card.innerHTML = \`
              <div class="record-title">[NOTE] \${escapeHtml(obj.title)}</div>
              <div class="record-field">\${escapeHtml(obj.content)}</div>
            \`;
          } else {
            card.innerHTML = \`
              <div class="record-title">[FILE MANIFEST] \${escapeHtml(obj.original_file_name || rec.record_id)}</div>
              <div class="record-field">Size: \${obj.plaintext_size} bytes • Chunks: \${obj.total_chunks}</div>
            \`;
          }
          results.appendChild(card);
        }

        status.innerText = \`Backup Verified & Decrypted! Date: \${payload.created_at} • Decrypted Records: \${decryptedCount}\`;
      } catch (err) {
        status.innerText = 'Decryption failed: ' + (err && err.message ? err.message : 'Incorrect key or corrupted backup.');
      }
    }
  </script>
</body>
</html>`;

export function buildOfflineTool(): { path: string; sha256: string } {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, offlineToolHtml, "utf8");

  const hash = crypto.createHash("sha256").update(offlineToolHtml).digest("hex");
  console.log(`✅ Standalone Offline Decryptor generated at: ${OUT_PATH}`);
  console.log(`🔒 SHA-256 Checksum: ${hash}`);

  return { path: OUT_PATH, sha256: hash };
}

if (require.main === module) {
  buildOfflineTool();
}
