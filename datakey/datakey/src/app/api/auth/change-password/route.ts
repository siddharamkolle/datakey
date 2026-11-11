import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { datakeyConfig } from "@config/datakey.config";
import { getVaultMeta, updateVaultPasswordWrapper } from "@/lib/db";
import {
  createSignedSessionToken,
  getSessionCookieOptions,
  hashServerVerifier,
  isHttpsRequest,
  isOwnerSessionValid,
  verifyServerToken,
} from "@/lib/auth/session";

const schema = z.object({
  currentAuthToken: z.string().min(32).max(256),
  newSalt: z.string().min(8).max(128),
  newAuthToken: z.string().min(32).max(256),
  newWrappedVekPass: z.string().min(16).max(512),
  newIvPass: z.string().min(8).max(64),
  newKdfIterations: z.number().int().min(datakeyConfig.security.pbkdf2.minIterations),
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
      return NextResponse.json({ error: "Invalid password change payload" }, { status: 400 });
    }

    const valid = verifyServerToken(
      parsed.data.currentAuthToken,
      meta.server_salt,
      meta.auth_verifier_hash
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Current Master Password is incorrect." },
        { status: 401 }
      );
    }

    const newSessionSecret = crypto.randomBytes(32).toString("hex");
    await updateVaultPasswordWrapper({
      salt: parsed.data.newSalt,
      server_salt: meta.server_salt,
      auth_verifier_hash: hashServerVerifier(parsed.data.newAuthToken, meta.server_salt),
      wrapped_vek_pass: parsed.data.newWrappedVekPass,
      iv_pass: parsed.data.newIvPass,
      kdf_iterations: parsed.data.newKdfIterations,
      session_secret: newSessionSecret,
      updated_at: new Date().toISOString(),
    });

    const sessionToken = createSignedSessionToken(newSessionSecret);
    const cookieOpts = getSessionCookieOptions(isHttpsRequest(req.headers, req.url));

    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookieOpts.name, sessionToken, cookieOpts);
    return res;
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json({ error: "Failed to update Master Password" }, { status: 500 });
  }
}

