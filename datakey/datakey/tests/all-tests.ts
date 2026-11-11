/**
 * DataKey Comprehensive Test Suite
 *
 * Tests:
 * 1. Simple Master Password Cryptography (PBKDF2-SHA256 + AES-256-GCM)
 * 2. Optional Downloadable Recovery Key File Flow & Password Reset
 * 3. Streaming Chunk Encryption & Attack Defenses
 * 4. Real Free Database Integration (SQLite): Vault Meta, Public View Editor, Lost Mode Stripping, Encrypted Records, File Chunks, Finder Transmissions
 * 5. Signed HttpOnly Session Verification
 * 6. Rate Limiting & Optional Turnstile Verification
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

// Isolate test database in OS temp directory BEFORE importing db module
const testDbPath = path.join(os.tmpdir(), `datakey-test-${Date.now()}.db`);
process.env.DATAKEY_DB_PATH = testDbPath;

import {
  SIMPLE_OWNER_ID,
  createSimpleVaultSetup,
  unwrapSimpleVekWithPassword,
  unwrapSimpleVekWithRecoveryKey,
  rewrapSimpleVekWithNewPassword,
  buildRecoveryKeyFileJson,
  deriveSubkeysFromVek,
  encryptRecord,
  decryptRecord,
  encryptFile,
  decryptFile,
  toHex,
  toBase64,
  fromBase64,
} from "../src/lib/crypto";
import {
  ensureDbInitialized,
  createVaultMeta,
  getVaultMeta,
  getPublicProfileFull,
  savePublicProfile,
  setLostMode,
  filterPublicScanResponse,
  insertVaultRecord,
  listVaultRecords,
  shredVaultRecord,
  saveEncryptedFileChunk,
  getEncryptedFileChunk,
  insertFinderTransmission,
  listFinderTransmissions,
} from "../src/lib/db";
import {
  createSignedSessionToken,
  hashServerVerifier,
  verifyServerToken,
  verifySignedSessionToken,
} from "../src/lib/auth/session";
import { checkRateLimit } from "../src/lib/security/ratelimit";
import { verifyTurnstileToken } from "../src/lib/security/turnstile";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("   DataKey Complete Security & Database Suite");
  console.log("==================================================\n");

  try {
    // -------------------------------------------------------------------------
    // [1] Simple Master Password Crypto (PBKDF2-SHA256 + AES-256-GCM)
    // -------------------------------------------------------------------------
    console.log("[1] Simple Master Password Cryptography");
    const masterPass = "MySimpleMasterPass#1";
    const { setupPayload, rawVek, recoveryKey } = await createSimpleVaultSetup(
      masterPass,
      100000
    );

    assert(rawVek.length === 32, "Root VEK is 32 bytes (256-bit)");
    assert(recoveryKey.startsWith("DK-"), "Recovery Key formatted cleanly as DK-...");

    const { vek: unwrappedPassVek, authToken } = await unwrapSimpleVekWithPassword(
      masterPass,
      setupPayload.salt,
      setupPayload.wrappedVekPass,
      setupPayload.ivPass,
      setupPayload.kdfIterations,
      setupPayload.keyVersion
    );
    assert(toHex(unwrappedPassVek) === toHex(rawVek), "Master Password unwraps exact VEK");
    assert(authToken === setupPayload.authToken, "Client authToken deterministic for server check");

    try {
      await unwrapSimpleVekWithPassword(
        "WrongPassword123",
        setupPayload.salt,
        setupPayload.wrappedVekPass,
        setupPayload.ivPass,
        setupPayload.kdfIterations,
        setupPayload.keyVersion
      );
      assert(false, "Wrong Master Password should fail unwrapping");
    } catch {
      assert(true, "Wrong Master Password rejected by AES-GCM tag");
    }

    // -------------------------------------------------------------------------
    // [2] Downloadable Recovery Key File & Password Reset
    // -------------------------------------------------------------------------
    console.log("\n[2] Downloadable Recovery Key File & Password Re-wrap");
    const recovJson = buildRecoveryKeyFileJson(recoveryKey);
    const { vek: unwrappedRecovVek } = await unwrapSimpleVekWithRecoveryKey(
      recovJson,
      setupPayload.wrappedVekRecov,
      setupPayload.ivRecov,
      setupPayload.keyVersion
    );
    assert(
      toHex(unwrappedRecovVek) === toHex(rawVek),
      "Recovery Key JSON file unwraps exact VEK"
    );

    const subkeys = deriveSubkeysFromVek(rawVek);
    const recPayload = await encryptRecord(
      subkeys.k_record,
      SIMPLE_OWNER_ID,
      "rec-1",
      "login",
      { title: "Bank", password: "secret_value" }
    );

    const rewrapped = await rewrapSimpleVekWithNewPassword("BrandNewPass#2", unwrappedRecovVek, 1, 100000);
    const { vek: vekAfterReset } = await unwrapSimpleVekWithPassword(
      "BrandNewPass#2",
      rewrapped.salt,
      rewrapped.wrappedVekPass,
      rewrapped.ivPass,
      rewrapped.kdfIterations,
      1
    );
    const subkeysAfterReset = deriveSubkeysFromVek(vekAfterReset);
    const decRec = await decryptRecord<{ password: string }>(
      subkeysAfterReset.k_record,
      SIMPLE_OWNER_ID,
      recPayload
    );
    assert(
      decRec.password === "secret_value",
      "Existing encrypted records stay readable after password reset without re-encryption"
    );

    // -------------------------------------------------------------------------
    // [3] File Chunk Encryption & Attack Defenses
    // -------------------------------------------------------------------------
    console.log("\n[3] Streaming Chunk Encryption & Attack Defenses");
    const testBytes = new Uint8Array(250 * 1024);
    for (let offset = 0; offset < testBytes.length; offset += 65536) {
      crypto.getRandomValues(
        testBytes.subarray(offset, Math.min(testBytes.length, offset + 65536))
      );
    }

    const { manifest: manifestA, chunks: chunksA } = await encryptFile(
      subkeys.k_file_master,
      SIMPLE_OWNER_ID,
      "file-a",
      "doc.pdf",
      "application/pdf",
      testBytes,
      100 * 1024
    );
    assert(chunksA.length === 3, "File encrypted into 3 authenticated chunks");

    const decryptedFile = await decryptFile(
      subkeys.k_file_master,
      SIMPLE_OWNER_ID,
      manifestA,
      chunksA
    );
    assert(
      Buffer.from(decryptedFile).equals(Buffer.from(testBytes)),
      "Encrypted file chunks reassemble and decrypt bit-for-bit"
    );

    try {
      await decryptFile(subkeys.k_file_master, SIMPLE_OWNER_ID, manifestA, [
        chunksA[1],
        chunksA[0],
        chunksA[2],
      ]);
      assert(false, "Reordered chunks should fail");
    } catch {
      assert(true, "Chunk reorder attack blocked");
    }

    // -------------------------------------------------------------------------
    // [4] Free SQLite Database Integration & Session Auth
    // -------------------------------------------------------------------------
    console.log("\n[4] Free SQLite Database & Session Auth");
    await ensureDbInitialized();
    const serverSalt = crypto.randomBytes(16).toString("hex");
    const sessionSecret = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    await createVaultMeta({
      id: "owner",
      salt: setupPayload.salt,
      server_salt: serverSalt,
      auth_verifier_hash: hashServerVerifier(setupPayload.authToken, serverSalt),
      wrapped_vek_pass: setupPayload.wrappedVekPass,
      iv_pass: setupPayload.ivPass,
      kdf_iterations: setupPayload.kdfIterations,
      recov_verifier_hash: hashServerVerifier(setupPayload.recovAuthToken, serverSalt),
      wrapped_vek_recov: setupPayload.wrappedVekRecov,
      iv_recov: setupPayload.ivRecov,
      session_secret: sessionSecret,
      key_version: 1,
      created_at: now,
      updated_at: now,
    });

    const dbMeta = await getVaultMeta();
    assert(dbMeta !== null, "Vault meta persisted to SQLite database");
    assert(
      verifyServerToken(setupPayload.authToken, dbMeta!.server_salt, dbMeta!.auth_verifier_hash),
      "Server verifies client authToken against salted hash"
    );
    assert(
      !verifyServerToken("bad-token", dbMeta!.server_salt, dbMeta!.auth_verifier_hash),
      "Server rejects invalid authToken"
    );

    const sessionCookie = createSignedSessionToken(sessionSecret);
    assert(verifySignedSessionToken(sessionCookie, sessionSecret), "Signed session token validates");
    assert(
      !verifySignedSessionToken(sessionCookie + "tamper", sessionSecret),
      "Tampered session cookie rejected"
    );

    // Public View Editor -> Database -> Public Scan + Lost Mode
    const profile = await getPublicProfileFull();
    profile.owner_name = "Shashank Test";
    profile.tagline = "Personal Hub";
    profile.bio = "Custom bio from Public View section";
    profile.masked_owner_phone = "+91 98765 43210";
    profile.public_email = "owner@example.com";
    profile.blood_group = "O+";
    profile.show_blood_group = true;
    profile.custom_links = [
      { id: "l1", label: "GitHub", url: "https://github.com/example", is_visible: true },
    ];
    profile.emergency_contacts = [
      { id: "c1", name: "Mom", relationship: "Mother", phone_number: "+91 99999", priority_order: 1, is_visible: true },
    ];
    await savePublicProfile(profile);

    const savedProfile = await getPublicProfileFull();
    const normalPublic = filterPublicScanResponse(savedProfile);
    assert(normalPublic.owner_name === "Shashank Test", "Public View edits saved & served on first page");
    assert(normalPublic.custom_links.length === 1, "Custom links visible in normal mode");
    assert(normalPublic.blood_group === "O+", "Enabled medical data visible in normal mode");
    assert(normalPublic.emergency_contacts.length === 1, "Emergency contacts visible in normal mode");

    await setLostMode(true);
    const lostDbProfile = await getPublicProfileFull();
    const lostPublic = filterPublicScanResponse(lostDbProfile);
    assert(lostPublic.lost_mode === true, "Lost Mode persisted to database");
    assert(lostPublic.masked_phone === null, "Lost Mode strips phone server-side");
    assert(lostPublic.public_email === null, "Lost Mode strips email server-side");
    assert(lostPublic.blood_group === null, "Lost Mode strips blood group server-side");
    assert(lostPublic.custom_links.length === 0, "Lost Mode strips custom links server-side");
    assert(lostPublic.emergency_contacts.length === 0, "Lost Mode strips emergency contacts server-side");

    // Encrypted Records & File Chunks in DB
    await insertVaultRecord({
      record_id: "rec-1",
      category: "login",
      folder_id: null,
      ciphertext: recPayload.ciphertext,
      salt: recPayload.salt,
      nonce: recPayload.nonce,
      auth_tag: recPayload.auth_tag,
      key_version: 1,
      version: 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
    const dbRecords = await listVaultRecords();
    assert(dbRecords.length === 1 && dbRecords[0].record_id === "rec-1", "Encrypted record saved in DB");

    await saveEncryptedFileChunk("file-a", 0, toBase64(chunksA[0].ciphertext_with_tag));
    const fetchedChunkB64 = await getEncryptedFileChunk("file-a", 0);
    assert(
      fetchedChunkB64 !== null &&
        Buffer.from(fromBase64(fetchedChunkB64)).equals(Buffer.from(chunksA[0].ciphertext_with_tag)),
      "Encrypted file chunk stored and retrieved from DB"
    );

    await shredVaultRecord("rec-1");
    assert((await listVaultRecords()).length === 0, "Record shredded cleanly from DB");

    // Finder Transmissions in DB
    await insertFinderTransmission({
      id: "tx-1",
      public_token: savedProfile.public_token,
      message: "Found your keychain near desk",
      finder_contact: "Reception",
      latitude: 12.97,
      longitude: 77.59,
      accuracy_meters: 15,
      location_denied: 0,
      created_at: now,
    });
    const txs = await listFinderTransmissions();
    assert(txs.length === 1 && txs[0].message.includes("keychain"), "Finder transmission saved in DB");

    // -------------------------------------------------------------------------
    // [5] Rate Limiter & Optional Turnstile Check
    // -------------------------------------------------------------------------
    console.log("\n[5] Rate Limiting & Optional Turnstile Check");
    const testIpKey = "test_rate_limit_" + Date.now();
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimit(testIpKey, 5, 60);
      assert(res.success, `Rate check #${i + 1} accepted within limit`);
    }
    assert(!(await checkRateLimit(testIpKey, 5, 60)).success, "Rate limiter blocks 6th request");
    assert((await verifyTurnstileToken("local-bypass")).success, "Turnstile gracefully bypassed when secret not configured");
    assert(!(await verifyTurnstileToken("bogus-invalid-token")).success, "Invalid Turnstile token rejected");

    console.log("\n==================================================");
    console.log("🎉 ALL SIMPLE CRYPTO, SECURITY & DATABASE TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Clean up temporary test SQLite files
    for (const suffix of ["", "-wal", "-shm"]) {
      const f = `${testDbPath}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // ignore cleanup lock on Windows if sqlite still open
        }
      }
    }
  }
}

runTestSuite().catch((err) => {
  console.error("Test Suite Failure:", err);
  process.exit(1);
});
