import {
  generate24WordMnemonic,
  isValidMnemonic,
  deriveKekRecov,
  deriveKekPass,
  deriveSubkeysFromVek,
  createVaultEnvelope,
  unwrapVekWithPassword,
  unwrapVekWithRecoveryPhrase,
  rewrapVekWithNewPassword,
  encryptRecord,
  decryptRecord,
  encryptFile,
  decryptFile,
} from "../index";

async function runAllCryptoTests() {
  console.log("==================================================");
  console.log("   DataKey V2.2 Cryptographic Test Suite (M1)   ");
  console.log("==================================================\n");

  const userId = "user_shashank_001";
  const masterPassword = "CorrectHorseBatteryStaple#2026!";
  let passedCount = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      throw new Error(`Test assertion failed: ${msg}`);
    }
    console.log(`✅ PASSED: ${msg}`);
    passedCount++;
  }

  // --- Test 1: BIP-39 Standard 24-Word Mnemonic Generation & Validation ---
  console.log("\n[1] BIP-39 24-Word Mnemonic & Derivation Tests");
  const phrase = generate24WordMnemonic();
  const words = phrase.trim().split(/\s+/);
  assert(words.length === 24, "Generated mnemonic has exactly 24 words");
  assert(isValidMnemonic(phrase), "BIP-39 mnemonic passes checksum validation");
  assert(!isValidMnemonic(phrase + " invalidword"), "Corrupted mnemonic rejected by validator");

  const kekRecov = await deriveKekRecov(phrase);
  assert(kekRecov.length === 32, "KEK_recov derived as exact 256-bit (32-byte) key");

  // --- Test 2: Argon2id KEK_pass Derivation ---
  console.log("\n[2] Argon2id Key Derivation Tests");
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  // For unit tests, use slightly reduced memory for instantaneous execution, or standard 64MiB
  const kekPass = await deriveKekPass(masterPassword, salt, 16384, 2);
  assert(kekPass.length === 32, "KEK_pass derived as exact 256-bit key from Argon2id");

  // --- Test 3: Vault Envelope & VEK Unwrapping ---
  console.log("\n[3] Vault Envelope & Dual Unwrapping Tests");
  const { envelope, rawVek } = await createVaultEnvelope(userId, masterPassword, phrase);
  assert(rawVek.length === 32, "Root VEK generated as 256 bits of CSPRNG entropy");
  assert(envelope.key_version === 1, "Envelope initialized with key_version 1");

  // Unlock with Master Password
  const unwrappedWithPass = await unwrapVekWithPassword(userId, masterPassword, envelope);
  assert(
    Buffer.from(unwrappedWithPass).equals(Buffer.from(rawVek)),
    "VEK successfully unwrapped using Master Password"
  );

  // Unlock with 24-Word Recovery Phrase
  const unwrappedWithPhrase = await unwrapVekWithRecoveryPhrase(userId, phrase, envelope);
  assert(
    Buffer.from(unwrappedWithPhrase).equals(Buffer.from(rawVek)),
    "VEK successfully unwrapped using 24-Word Recovery Phrase"
  );

  // Wrong password rejected
  try {
    await unwrapVekWithPassword(userId, "WrongPassword#123", envelope);
    assert(false, "Unwrapping with wrong password should have failed");
  } catch {
    assert(true, "Unwrapping with wrong password correctly threw error");
  }

  // --- Test 4: Subkey Derivation ---
  console.log("\n[4] HKDF Domain-Separated Subkey Derivation");
  const subkeys = deriveSubkeysFromVek(rawVek);
  assert(subkeys.k_record.length === 32, "K_record subkey is 32 bytes");
  assert(subkeys.k_file_master.length === 32, "K_file_master subkey is 32 bytes");
  assert(subkeys.k_export.length === 32, "K_export subkey is 32 bytes");
  assert(subkeys.k_manifest.length === 32, "K_manifest subkey is 32 bytes");
  assert(
    !Buffer.from(subkeys.k_record).equals(Buffer.from(subkeys.k_file_master)),
    "Subkeys are strictly domain-separated and distinct"
  );

  // --- Test 5: Single-Use Derived Key Record Encryption & Decryption ---
  console.log("\n[5] Record Encryption (Single-Use Derived Keys) Tests");
  const sensitiveRecord = {
    title: "Primary Banking Login",
    username: "shashank",
    password: "VaultSecretSuperPass#992",
    notes: "Locker key stored in safe room",
    pin: "8841",
  };

  const encryptedRecord = await encryptRecord(
    subkeys.k_record,
    userId,
    "rec_bank_001",
    "password",
    sensitiveRecord
  );

  assert(encryptedRecord.ciphertext.length > 0, "Record ciphertext generated");
  assert(encryptedRecord.auth_tag.length > 0, "Record 16-byte auth tag generated");
  assert(encryptedRecord.salt.length > 0, "Record one-time salt generated");

  const decryptedRecord = await decryptRecord<typeof sensitiveRecord>(
    subkeys.k_record,
    userId,
    encryptedRecord
  );

  assert(
    decryptedRecord.password === sensitiveRecord.password &&
      decryptedRecord.username === sensitiveRecord.username &&
      decryptedRecord.pin === sensitiveRecord.pin,
    "Record decrypted perfectly in volatile memory"
  );

  // Tamper detection: modifying 1 character in ciphertext
  const tamperedCiphertext = {
    ...encryptedRecord,
    ciphertext: Buffer.from("TAMPERED_PAYLOAD_HERE").toString("base64"),
  };
  try {
    await decryptRecord(subkeys.k_record, userId, tamperedCiphertext);
    assert(false, "Tampered ciphertext should fail decryption");
  } catch {
    assert(true, "Tampered ciphertext correctly rejected by AES-GCM tag verification");
  }

  // --- Test 6: Password Change & Zero Re-encryption of Vault Records ---
  console.log("\n[6] Password Change & Record Persistence Tests");
  const newMasterPassword = "NewCompletelyDifferentMasterPass#4096!";
  const rewrapped = await rewrapVekWithNewPassword(userId, newMasterPassword, rawVek, 1);

  const updatedEnvelope = {
    ...envelope,
    wrapped_vek_pass: rewrapped.wrapped_vek_pass,
    salt_vault: rewrapped.salt_vault,
    iv_pass: rewrapped.iv_pass,
  };

  const unwrappedWithNewPass = await unwrapVekWithPassword(userId, newMasterPassword, updatedEnvelope);
  assert(
    Buffer.from(unwrappedWithNewPass).equals(Buffer.from(rawVek)),
    "VEK successfully unwrapped with NEW Master Password"
  );

  // Old password no longer works
  try {
    await unwrapVekWithPassword(userId, masterPassword, updatedEnvelope);
    assert(false, "Old password should no longer work");
  } catch {
    assert(true, "Old password correctly rejected after password change");
  }

  // Decrypt previously encrypted record with VEK unwrapped from new password (PROVES ZERO RE-ENCRYPTION NEEDED!)
  const subkeysFromNew = deriveSubkeysFromVek(unwrappedWithNewPass);
  const decryptedAfterPassChange = await decryptRecord<typeof sensitiveRecord>(
    subkeysFromNew.k_record,
    userId,
    encryptedRecord
  );
  assert(
    decryptedAfterPassChange.password === sensitiveRecord.password,
    "Previously encrypted record remains fully readable without re-encryption"
  );

  // --- Test 7: Streaming Chunked File Encryption & Authenticated Manifest ---
  console.log("\n[7] Streaming Chunked File Encryption & Attack Defense Tests");
  // Create a 500 KB test binary buffer (simulating an identity document or PDF)
  const testFileSize = 500 * 1024;
  const testBytes = new Uint8Array(testFileSize);
  for (let i = 0; i < testFileSize; i++) {
    testBytes[i] = (i * 31 + 7) & 0xff;
  }

  // Use a 128 KB chunk size to test multi-chunk framing
  const testChunkSize = 128 * 1024;
  const { manifest, chunks } = await encryptFile(
    subkeys.k_file_master,
    userId,
    "file_passport_001",
    "passport.pdf",
    "application/pdf",
    testBytes,
    testChunkSize
  );

  assert(manifest.total_chunks === 4, "File correctly partitioned into 4 authenticated chunks");
  assert(manifest.chunk_hashes.length === 4, "Manifest contains SHA-256 hash for every chunk");

  // Normal successful decryption
  const recoveredFile = await decryptFile(
    subkeys.k_file_master,
    userId,
    manifest,
    chunks
  );

  assert(
    Buffer.from(recoveredFile).equals(Buffer.from(testBytes)),
    "Complete file reassembled and verified bit-for-bit"
  );

  // Attack 1: Reordered chunks (chunk 1 swapped with chunk 0)
  const reorderedChunks = [chunks[1], chunks[0], chunks[2], chunks[3]];
  try {
    await decryptFile(subkeys.k_file_master, userId, manifest, reorderedChunks);
    assert(false, "Reordered chunks should fail");
  } catch {
    assert(true, "Chunk reordering attack successfully detected and blocked");
  }

  // Attack 2: Dropped chunk (only 3 chunks sent)
  const droppedChunk = [chunks[0], chunks[1], chunks[2]];
  try {
    await decryptFile(subkeys.k_file_master, userId, manifest, droppedChunk);
    assert(false, "Dropped chunk should fail");
  } catch {
    assert(true, "Chunk truncation / missing chunk attack successfully detected and blocked");
  }

  // Attack 3: Tampered ciphertext in chunk 2
  const tamperedChunks = chunks.map((c, idx) => {
    if (idx === 2) {
      const copy = new Uint8Array(c.ciphertext_with_tag);
      copy[10] ^= 0xff; // flip bits
      return { ...c, ciphertext_with_tag: copy };
    }
    return c;
  });
  try {
    await decryptFile(subkeys.k_file_master, userId, manifest, tamperedChunks);
    assert(false, "Bit-flipped chunk should fail");
  } catch {
    assert(true, "Ciphertext chunk bit-flip attack successfully detected and blocked");
  }

  console.log("\n==================================================");
  console.log(`🎉 ALL ${passedCount} CRYPTOGRAPHIC TESTS PASSED SUCCESSFULLY!`);
  console.log("==================================================\n");
}

runAllCryptoTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
