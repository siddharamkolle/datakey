import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length > 64) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
      return NextResponse.json({
        public_token: token,
        lost_mode: false,
        owner_name: "DataKey Owner",
        masked_phone: "+1 (•••) •••-••••",
        emergency_instructions: "If you found this keychain, please submit your contact info or location so the owner can recover it.",
        emergency_contacts: [],
      });
    }

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase.rpc("get_public_scan_profile", {
      p_token: token,
    });

    if (error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Keychain not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
