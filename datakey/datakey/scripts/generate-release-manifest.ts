/**
 * Generates release-manifest.json containing cryptographic SHA-256 hashes of all release artifacts.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const MANIFEST_PATH = path.join(process.cwd(), "release-manifest.json");

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function generateReleaseManifest() {
  const filesToTrack = [
    "public/datakey-offline.html",
    "public/manifest.json",
    "public/icon-192.svg",
    "public/icon-512.svg",
    "config/datakey.config.ts",
    "supabase/migrations/20261104000000_datakey_schema.sql",
    "package.json",
  ];

  const hashes: Record<string, string> = {};

  for (const relPath of filesToTrack) {
    const fullPath = path.join(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      hashes[relPath] = hashFile(fullPath);
    }
  }

  const manifest = {
    version: "2.2.0",
    generated_at: new Date().toISOString(),
    hashes,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`✅ Release manifest generated at: ${MANIFEST_PATH}`);
  return manifest;
}

if (require.main === module) {
  generateReleaseManifest();
}

