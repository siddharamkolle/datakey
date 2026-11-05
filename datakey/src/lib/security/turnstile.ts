/**
 * Validates Cloudflare Turnstile token server-side.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // In test environments or when secret is not set, allow test bypass if not in production
  if (!secretKey) {
    if (process.env.NODE_ENV !== "production") {
      // Allow test tokens like "XXXX.DUMMY.TOKEN.XXXX" or "test-valid-turnstile-token"
      if (token.startsWith("XXXX.") || token === "test-valid-turnstile-token") {
        return { success: true };
      }
    }
    return {
      success: false,
      errorCodes: ["missing-turnstile-secret"],
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const data = await response.json();
    return {
      success: !!data.success,
      errorCodes: data["error-codes"],
    };
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return { success: false, errorCodes: ["verification-network-failure"] };
  }
}
