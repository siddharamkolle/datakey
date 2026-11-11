import { NextRequest, NextResponse } from "next/server";
import { filterPublicScanResponse, getPublicProfileByToken } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length > 64) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const profile = await getPublicProfileByToken(token);
    if (!profile) {
      return NextResponse.json({ error: "Keychain not found" }, { status: 404 });
    }

    return NextResponse.json(filterPublicScanResponse(profile));
  } catch (err) {
    console.error("Public scan route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
