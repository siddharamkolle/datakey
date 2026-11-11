import { NextResponse } from "next/server";
import { getActiveDbDriver, getVaultMeta } from "@/lib/db";
import { isOwnerSessionValid } from "@/lib/auth/session";

export async function GET() {
  try {
    const meta = await getVaultMeta();
    const authenticated = meta ? await isOwnerSessionValid() : false;

    if (!meta) {
      return NextResponse.json({
        initialized: false,
        authenticated: false,
        dbDriver: getActiveDbDriver(),
      });
    }

    return NextResponse.json({
      initialized: true,
      salt: meta.salt,
      kdfIterations: meta.kdf_iterations,
      keyVersion: meta.key_version,
      hasRecoveryKey: Boolean(meta.recov_verifier_hash && meta.wrapped_vek_recov),
      authenticated,
      dbDriver: getActiveDbDriver(),
    });
  } catch (err) {
    console.error("Auth status error:", err);
    return NextResponse.json(
      { error: "Database initialization or status check failed." },
      { status: 500 }
    );
  }
}

