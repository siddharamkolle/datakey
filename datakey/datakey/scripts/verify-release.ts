/**
 * Verifies that local files match the cryptographic hashes recorded in release-manifest.json.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const MANIFEST_PATH = path.join(process.cwd(), "release-manifest.json");

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function verifyRelease(): boolean {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("❌ release-manifest.json not found. Run generate-release-manifest first.");
    return false;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  let allMatched = true;

  console.log(`🔍 Verifying DataKey Release Manifest (v${manifest.version})...`);

  for (const [relPath, expectedHash] of Object.entries(manifest.hashes)) {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ Missing file: ${relPath}`);
      allMatched = false;
      continue;
    }

    const actualHash = hashFile(fullPath);
    if (actualHash !== expectedHash) {
      console.error(`❌ Hash mismatch for ${relPath}:`);
      console.error(`   Expected: ${expectedHash}`);
      console.error(`   Actual:   ${actualHash}`);
      allMatched = false;
    } else {
      console.log(`✅ Verified: ${relPath}`);
    }
  }

  if (allMatched) {
    console.log("🎉 All release artifacts passed cryptographic integrity verification!");
  } else {
    console.error("⚠️ Some release artifacts failed integrity verification.");
  }

  return allMatched;
}

if (require.main === module) {
  const success = verifyRelease();
  process.exit(success ? 0 : 1);
}

