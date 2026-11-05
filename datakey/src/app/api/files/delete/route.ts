import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteFileChunksFromR2 } from "@/lib/storage/r2";

const schema = z.object({
  fileId: z.string().uuid(),
  totalChunks: z.number().int().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== "aal2") {
      return NextResponse.json(
        { error: "Multi-factor authentication (AAL2) required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { fileId, totalChunks } = parsed.data;
    await deleteFileChunksFromR2(user.id, fileId, totalChunks);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Delete chunks error:", err);
    return NextResponse.json({ error: "Storage deletion error" }, { status: 500 });
  }
}
