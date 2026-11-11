import crypto from "crypto";
import { cookies } from "next/headers";
import { datakeyConfig } from "@config/datakey.config";
import { getVaultMeta } from "@/lib/db";

export const SESSION_COOKIE_NAME = "datakey_session";

/**
 * Computes salted SHA-256 verifier hash on the server so authToken is never stored raw.
 */
export function hashServerVerifier(authToken: string, serverSalt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${serverSalt}:${authToken}`)
    .digest("hex");
}

export function verifyServerToken(
  providedAuthToken: string,
  serverSalt: string,
  expectedHash: string
): boolean {
  const actualHash = hashServerVerifier(providedAuthToken, serverSalt);
  const a = Buffer.from(actualHash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signPayload(payloadB64: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
}

export function createSignedSessionToken(sessionSecret: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = datakeyConfig.security.sessions.cookieDurationHours * 3600;
  const payload = {
    v: 1,
    iat: nowSec,
    exp: nowSec + ttlSec,
    jti: crypto.randomBytes(12).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(payloadB64, sessionSecret);
  return `${payloadB64}.${sig}`;
}

export function verifySignedSessionToken(
  token: string | undefined,
  sessionSecret: string
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;

  const expectedSig = signPayload(payloadB64, sessionSecret);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      exp?: number;
    };
    const nowSec = Math.floor(Date.now() / 1000);
    return typeof parsed.exp === "number" && parsed.exp > nowSec;
  } catch {
    return false;
  }
}

export async function isOwnerSessionValid(): Promise<boolean> {
  const meta = await getVaultMeta();
  if (!meta) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySignedSessionToken(token, meta.session_secret);
}

export function isHttpsRequest(headers: Headers, requestUrl?: string): boolean {
  const proto = headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0].trim().toLowerCase() === "https";
  }
  if (requestUrl) {
    return requestUrl.startsWith("https://");
  }
  return false;
}

export function getSessionCookieOptions(isHttps = false) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isHttps,
    maxAge: datakeyConfig.security.sessions.cookieDurationHours * 3600,
  };
}
