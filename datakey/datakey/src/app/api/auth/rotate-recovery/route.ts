import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getVaultMeta, updateVaultRecoveryWrapper } from "@/lib/db";
import { hashServerVerifier, isOwnerSessionValid } from "@/lib/auth/session";

const schema = z.object({
  recovAuthToken: z.string().min(32).max(256),
  wrappedVekRecov: z.string().min(16).max(512),
  ivRecov: z.string().min(8).max(64),
});

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meta = await getVaultMeta();
    if (!meta) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid recovery key payload" }, { status: 400 });
    }

    await updateVaultRecoveryWrapper({
      recov_verifier_hash: hashServerVerifier(parsed.data.recovAuthToken, meta.server_salt),
      wrapped_vek_recov: parsed.data.wrappedVekRecov,
      iv_recov: parsed.data.ivRecov,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Rotate recovery key error:", err);
    return NextResponse.json({ error: "Failed to update recovery key" }, { status: 500 });
  }
}

