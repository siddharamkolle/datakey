import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerSessionValid } from "@/lib/auth/session";
import { saveEncryptedFileChunk } from "@/lib/db";

const schema = z.object({
  fileId: z.string().min(1).max(128),
  chunkIndex: z.number().int().min(0).max(1000),
  dataBase64: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chunk upload payload" }, { status: 400 });
    }

    await saveEncryptedFileChunk(
      parsed.data.fileId,
      parsed.data.chunkIndex,
      parsed.data.dataBase64
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Chunk upload error:", err);
    return NextResponse.json({ error: "Failed to store encrypted chunk" }, { status: 500 });
  }
}

