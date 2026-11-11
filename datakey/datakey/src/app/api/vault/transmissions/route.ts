import { NextRequest, NextResponse } from "next/server";
import { isOwnerSessionValid } from "@/lib/auth/session";
import { deleteFinderTransmission, listFinderTransmissions } from "@/lib/db";

export async function GET() {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rows = await listFinderTransmissions();
    const transmissions = rows.map((t) => ({
      id: t.id,
      finder_message: t.message,
      finder_contact_info: t.finder_contact || undefined,
      latitude: t.latitude,
      longitude: t.longitude,
      accuracy_meters: t.accuracy_meters ?? undefined,
      location_denied: Boolean(t.location_denied),
      created_at: t.created_at,
    }));
    return NextResponse.json({ transmissions });
  } catch (err) {
    console.error("List transmissions error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing transmission id" }, { status: 400 });
    }
    await deleteFinderTransmission(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete transmission error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

