import { NextRequest, NextResponse } from "next/server";
import { isOwnerSessionValid } from "@/lib/auth/session";
import { getEncryptedFileChunk } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fileId = req.nextUrl.searchParams.get("fileId");
    const chunkIndexStr = req.nextUrl.searchParams.get("chunkIndex");
    const chunkIndex = chunkIndexStr ? Number(chunkIndexStr) : NaN;

    if (!fileId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "Invalid chunk query parameters" }, { status: 400 });
    }

    const dataBase64 = await getEncryptedFileChunk(fileId, chunkIndex);
    if (!dataBase64) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }

    return NextResponse.json({ dataBase64 });
  } catch (err) {
    console.error("Chunk download error:", err);
    return NextResponse.json({ error: "Failed to fetch encrypted chunk" }, { status: 500 });
  }
}

