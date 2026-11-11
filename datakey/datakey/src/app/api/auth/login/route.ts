import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { datakeyConfig } from "@config/datakey.config";
import { getVaultMeta } from "@/lib/db";
import { checkRateLimit } from "@/lib/security/ratelimit";
import {
  createSignedSessionToken,
  getSessionCookieOptions,
  isHttpsRequest,
  verifyServerToken,
} from "@/lib/auth/session";

const loginSchema = z.object({
  authToken: z.string().min(32).max(256),
});

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-client";
    const rate = await checkRateLimit(
      `master_login:${clientIp}`,
      datakeyConfig.security.rateLimits.authAttemptsPer15Minutes,
      900
    );

    if (!rate.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const meta = await getVaultMeta();
    if (!meta) {
      return NextResponse.json(
        { error: "Vault has not been set up yet." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
    }

    const valid = verifyServerToken(
      parsed.data.authToken,
      meta.server_salt,
      meta.auth_verifier_hash
    );

    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect Master Password." },
        { status: 401 }
      );
    }

    const sessionToken = createSignedSessionToken(meta.session_secret);
    const cookieOpts = getSessionCookieOptions(isHttpsRequest(req.headers, req.url));

    const res = NextResponse.json({
      wrappedVekPass: meta.wrapped_vek_pass,
      ivPass: meta.iv_pass,
      keyVersion: meta.key_version,
    });
    res.cookies.set(cookieOpts.name, sessionToken, cookieOpts);
    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}

