import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerSessionValid } from "@/lib/auth/session";
import { getPublicProfileFull, savePublicProfile, setLostMode } from "@/lib/db";
import type { PublicEmergencyProfile } from "@/lib/vault/vaultState";

const customLinkSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(100),
  url: z.string().max(500),
  is_visible: z.boolean(),
});

const contactSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  relationship: z.string().max(80).default(""),
  phone_number: z.string().min(1).max(60),
  priority_order: z.number().int().min(1).max(100).default(1),
  is_visible: z.boolean(),
});

const profileSchema = z.object({
  public_token: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Public link slug may only contain letters, numbers, hyphens, and underscores"),
  is_lost_mode: z.boolean(),
  lost_banner_title: z.string().max(140),
  owner_name: z.string().max(140),
  tagline: z.string().max(200),
  bio: z.string().max(2000),
  location_label: z.string().max(140),
  avatar_url: z.string().max(500),
  masked_owner_phone: z.string().max(60),
  public_email: z.string().max(160),
  blood_group: z.string().max(24),
  allergies: z.string().max(500),
  critical_medical_notes: z.string().max(2000),
  emergency_instructions: z.string().max(2000),
  custom_links: z.array(customLinkSchema).max(30),
  emergency_contacts: z.array(contactSchema).max(20),
  show_avatar: z.boolean(),
  show_owner_name: z.boolean(),
  show_tagline: z.boolean(),
  show_location: z.boolean(),
  show_bio: z.boolean(),
  show_owner_phone: z.boolean(),
  show_public_email: z.boolean(),
  show_custom_links: z.boolean(),
  show_blood_group: z.boolean(),
  show_allergies: z.boolean(),
  show_medical_notes: z.boolean(),
  show_emergency_contacts: z.boolean(),
  show_message_form: z.boolean(),
  show_qr_code: z.boolean(),
});

const lostModeSchema = z.object({
  lostModeOnly: z.literal(true),
  enabled: z.boolean(),
});

export async function GET() {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getPublicProfileFull();
    return NextResponse.json(profile);
  } catch (err) {
    console.error("Get full public profile error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Quick Lost Mode toggle path
    const lostParsed = lostModeSchema.safeParse(body);
    if (lostParsed.success) {
      await setLostMode(lostParsed.data.enabled);
      return NextResponse.json({ ok: true, is_lost_mode: lostParsed.data.enabled });
    }

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid public view fields" },
        { status: 400 }
      );
    }

    await savePublicProfile(parsed.data as PublicEmergencyProfile);
    return NextResponse.json({ ok: true, profile: parsed.data });
  } catch (err) {
    console.error("Save public profile error:", err);
    return NextResponse.json({ error: "Failed to save public view" }, { status: 500 });
  }
}

