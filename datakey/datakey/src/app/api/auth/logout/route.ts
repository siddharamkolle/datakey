import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { rotateVaultSessionSecret } from "@/lib/db";
import { isOwnerSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.revokeAll && (await isOwnerSessionValid())) {
      await rotateVaultSessionSecret(crypto.randomBytes(32).toString("hex"));
    }
  } catch {
    // Best-effort rotation
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}

