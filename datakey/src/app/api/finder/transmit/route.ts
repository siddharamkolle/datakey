import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security/ratelimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { notifyOwnerOfFinderTransmission } from "@/lib/notifications";

const transmitSchema = z.object({
  token: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  finderContact: z.string().max(255).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  accuracyMeters: z.number().min(0).max(100000).optional().nullable(),
  locationDenied: z.boolean().default(false),
  turnstileToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = transmitSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transmission payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      token,
      message,
      finderContact,
      latitude,
      longitude,
      accuracyMeters,
      locationDenied,
      turnstileToken,
    } = parsed.data;

    // 1. Rate limiting by token and anonymized client hash (NO IP STORED IN DB)
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
    const rateLimitKey = `finder_submit:${token}:${clientIp}`;
    const rateCheck = await checkRateLimit(rateLimitKey);

    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please wait before submitting another report.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateCheck.reset - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // 2. Cloudflare Turnstile Verification
    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: "Human verification failed. Please refresh and try again." },
        { status: 403 }
      );
    }

    // 3. Lookup user_id matching this public_token via Service Role client
    const supabaseAdmin = createServiceRoleClient();
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("public_profiles")
      .select("user_id, lost_mode")
      .eq("public_token", token)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Target keychain token was not found." },
        { status: 404 }
      );
    }

    // 4. Insert into finder_transmissions WITHOUT storing the IP address
    const { error: insertError } = await supabaseAdmin
      .from("finder_transmissions")
      .insert({
        user_id: profile.user_id,
        public_token: token,
        message,
        finder_contact: finderContact || null,
        latitude: locationDenied ? null : latitude ?? null,
        longitude: locationDenied ? null : longitude ?? null,
        accuracy_meters: locationDenied ? null : accuracyMeters ?? null,
        location_denied: locationDenied,
      });

    if (insertError) {
      console.error("Failed to store finder transmission:", insertError);
      return NextResponse.json(
        { error: "Database storage failed. Please try again later." },
        { status: 500 }
      );
    }

    // 5. Asynchronously notify the owner via Telegram and Email
    notifyOwnerOfFinderTransmission({
      token,
      message,
      finderContact,
      latitude: locationDenied ? null : latitude ?? null,
      longitude: locationDenied ? null : longitude ?? null,
      accuracyMeters: locationDenied ? null : accuracyMeters ?? null,
      locationDenied,
      timestamp: new Date().toISOString(),
    }).catch((err) => console.error("Notification background error:", err));

    return NextResponse.json({
      success: true,
      message: "Transmission securely dispatched to the keychain owner.",
    });
  } catch (err: unknown) {
    console.error("Transmission server error:", err);
    return NextResponse.json(
      { error: "Internal server error occurred." },
      { status: 500 }
    );
  }
}
