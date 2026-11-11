import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { datakeyConfig } from "@config/datakey.config";
import { getVaultMeta, updateVaultPasswordWrapper } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/ratelimit";
import {
  createSignedSessionToken,
  getSessionCookieOptions,
  hashServerVerifier,
  isHttpsRequest,
  verifyServerToken,
} from "@/lib/auth/session";

const verifyRecoverySchema = z.object({
  action: z.literal("verify"),
  recovAuthToken: z.string().min(32).max(256),
});

const resetWithRecoverySchema = z.object({
  action: z.literal("reset"),
  recovAuthToken: z.string().min(32).max(256),
  newSalt: z.string().min(8).max(128),
  newAuthToken: z.string().min(32).max(256),
  newWrappedVekPass: z.string().min(16).max(512),
  newIvPass: z.string().min(8).max(64),
  newKdfIterations: z.number().int().min(datakeyConfig.security.pbkdf2.minIterations),
});

const recoverSchema = z.discriminatedUnion("action", [
  verifyRecoverySchema,
  resetWithRecoverySchema,
]);

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-client";
    const rate = await checkRateLimit(
      `vault_recover:${clientIp}`,
      datakeyConfig.security.rateLimits.authAttemptsPer15Minutes,
      900
    );
    if (!rate.success) {
      return NextResponse.json(
        { error: "Too many recovery attempts. Please wait and try again." },
        { status: 429 }
      );
    }

    const meta = await getVaultMeta();
    if (!meta || !meta.recov_verifier_hash || !meta.wrapped_vek_recov || !meta.iv_recov) {
      return NextResponse.json(
        { error: "Recovery key is not configured for this vault." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = recoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid recovery request." }, { status: 400 });
    }

    const valid = verifyServerToken(
      parsed.data.recovAuthToken,
      meta.server_salt,
      meta.recov_verifier_hash
    );

    if (!valid) {
      return NextResponse.json({ error: "Invalid Recovery Key." }, { status: 401 });
    }

    if (parsed.data.action === "verify") {
      return NextResponse.json({
        wrappedVekRecov: meta.wrapped_vek_recov,
        ivRecov: meta.iv_recov,
        keyVersion: meta.key_version,
      });
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
    console.error("Recovery error:", err);
    return NextResponse.json({ error: "Vault recovery failed." }, { status: 500 });
  }
}

