import { NextResponse } from "next/server";
import { getVaultMeta } from "@/lib/db";

export async function GET() {
  try {
    const meta = await getVaultMeta();
    return NextResponse.json({
      registrationAllowed: !meta,
    });
  } catch {
    return NextResponse.json({ registrationAllowed: false });
  }
}
