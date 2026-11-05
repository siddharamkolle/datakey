import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
    return NextResponse.json({ registrationAllowed: true });
  }

  try {
    const supabaseAdmin = createServiceRoleClient();
    const { data, error } = await supabaseAdmin.rpc("check_registration_allowed");

    if (error) {
      const { count } = await supabaseAdmin
        .from("vault_envelopes")
        .select("*", { count: "exact", head: true });
      return NextResponse.json({
        registrationAllowed: (count ?? 0) === 0,
      });
    }

    return NextResponse.json({
      registrationAllowed: !!data,
    });
  } catch {
    return NextResponse.json({ registrationAllowed: false });
  }
}
