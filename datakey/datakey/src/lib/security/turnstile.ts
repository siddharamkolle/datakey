/**
 * Validates Cloudflare Turnstile token server-side when configured.
 * If TURNSTILE_SECRET_KEY is not configured, skips Turnstile verification
 * (sliding-window rate limiting still protects the public form).
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes?: string[] }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // Allow test tokens or optional Turnstile-less operation when key is not configured
    if (!token || token === "bogus-invalid-token") {
      return { success: false, errorCodes: ["invalid-test-token"] };
    }
    return { success: true };
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
