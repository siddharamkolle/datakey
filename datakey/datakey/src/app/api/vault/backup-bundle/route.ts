import { NextResponse } from "next/server";
import { isOwnerSessionValid } from "@/lib/auth/session";
import { getVaultMeta, listVaultRecords } from "@/lib/db";

export async function GET() {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [meta, records] = await Promise.all([getVaultMeta(), listVaultRecords()]);
    if (!meta) {
      return NextResponse.json({ error: "Vault metadata not found" }, { status: 404 });
    }

    // Export public-safe cryptographic wrappers (no server_salt, no verifier hashes, no session_secret!)
    return NextResponse.json({
      envelope: {
        salt: meta.salt,
        kdf_iterations: meta.kdf_iterations,
        key_version: meta.key_version,
        wrapped_vek_pass: meta.wrapped_vek_pass,
        iv_pass: meta.iv_pass,
        wrapped_vek_recov: meta.wrapped_vek_recov,
        iv_recov: meta.iv_recov,
      },
      records,
    });
  } catch (err) {
    console.error("Backup bundle error:", err);
    return NextResponse.json({ error: "Failed to create backup bundle" }, { status: 500 });
  }
}

