import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { datakeyConfig } from "@config/datakey.config";
import { createVaultMeta, getVaultMeta } from "@/lib/db";
import {
  createSignedSessionToken,
  getSessionCookieOptions,
  hashServerVerifier,
  isHttpsRequest,
} from "@/lib/auth/session";

const setupSchema = z.object({
  salt: z.string().min(8).max(128),
  authToken: z.string().min(32).max(256),
  wrappedVekPass: z.string().min(16).max(512),
  ivPass: z.string().min(8).max(64),
  kdfIterations: z.number().int().min(datakeyConfig.security.pbkdf2.minIterations),
  recovAuthToken: z.string().min(32).max(256),
  wrappedVekRecov: z.string().min(16).max(512),
  ivRecov: z.string().min(8).max(64),
  keyVersion: z.number().int().min(1).default(1),
});

export async function POST(req: NextRequest) {
  try {
    const existing = await getVaultMeta();
    if (existing) {
      return NextResponse.json(
        { error: "Vault is already initialized. Please log in with your Master Password." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid vault setup payload." },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const serverSalt = crypto.randomBytes(16).toString("hex");
    const sessionSecret = crypto.randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    await createVaultMeta({
      id: "owner",
      salt: data.salt,
      server_salt: serverSalt,
      auth_verifier_hash: hashServerVerifier(data.authToken, serverSalt),
      wrapped_vek_pass: data.wrappedVekPass,
      iv_pass: data.ivPass,
      kdf_iterations: data.kdfIterations,
      recov_verifier_hash: hashServerVerifier(data.recovAuthToken, serverSalt),
      wrapped_vek_recov: data.wrappedVekRecov,
      iv_recov: data.ivRecov,
      session_secret: sessionSecret,
      key_version: data.keyVersion,
      created_at: now,
      updated_at: now,
    });

    const sessionToken = createSignedSessionToken(sessionSecret);
    const cookieOpts = getSessionCookieOptions(isHttpsRequest(req.headers, req.url));

    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookieOpts.name, sessionToken, cookieOpts);
    return res;
  } catch (err) {
    console.error("Setup error:", err);
    return NextResponse.json(
      { error: "Failed to initialize vault." },
      { status: 500 }
    );
  }
}

