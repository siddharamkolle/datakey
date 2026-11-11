import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerSessionValid } from "@/lib/auth/session";
import {
  insertVaultRecord,
  listVaultRecords,
  setVaultRecordDeletedAt,
  shredVaultRecord,
  updateVaultRecordEncrypted,
} from "@/lib/db";

const createSchema = z.object({
  record_id: z.string().min(1).max(128),
  category: z.enum(["login", "note", "file_manifest"]),
  folder_id: z.string().max(64).nullable().optional(),
  ciphertext: z.string().min(1),
  salt: z.string().min(1),
  nonce: z.string().min(1),
  auth_tag: z.string().min(1),
  key_version: z.number().int().min(1).default(1),
});

const updateSchema = z.object({
  record_id: z.string().min(1).max(128),
  folder_id: z.string().max(64).nullable().optional(),
  ciphertext: z.string().min(1),
  salt: z.string().min(1),
  nonce: z.string().min(1),
  auth_tag: z.string().min(1),
  expected_version: z.number().int().min(1),
  new_version: z.number().int().min(2),
});

const trashSchema = z.object({
  record_id: z.string().min(1).max(128),
  deleted_at: z.string().nullable(),
});

export async function GET() {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const records = await listVaultRecords();
    return NextResponse.json({ records });
  } catch (err) {
    console.error("List vault records error:", err);
    return NextResponse.json({ error: "Failed to load records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid encrypted record payload" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await insertVaultRecord({
      record_id: parsed.data.record_id,
      category: parsed.data.category,
      folder_id: parsed.data.folder_id ?? null,
      ciphertext: parsed.data.ciphertext,
      salt: parsed.data.salt,
      nonce: parsed.data.nonce,
      auth_tag: parsed.data.auth_tag,
      key_version: parsed.data.key_version,
      version: 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json({ ok: true, created_at: now, updated_at: now });
  } catch (err) {
    console.error("Insert vault record error:", err);
    return NextResponse.json({ error: "Failed to save encrypted record" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updated = await updateVaultRecordEncrypted({
      record_id: parsed.data.record_id,
      ciphertext: parsed.data.ciphertext,
      salt: parsed.data.salt,
      nonce: parsed.data.nonce,
      auth_tag: parsed.data.auth_tag,
      folder_id: parsed.data.folder_id ?? null,
      expected_version: parsed.data.expected_version,
      new_version: parsed.data.new_version,
      updated_at: now,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "409 Conflict: Record was modified elsewhere. Please refresh." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, updated_at: now });
  } catch (err) {
    console.error("Update vault record error:", err);
    return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = trashSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid trash request" }, { status: 400 });
    }

    await setVaultRecordDeletedAt(parsed.data.record_id, parsed.data.deleted_at);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Trash vault record error:", err);
    return NextResponse.json({ error: "Failed to update trash status" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await isOwnerSessionValid())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recordId = req.nextUrl.searchParams.get("record_id");
    if (!recordId) {
      return NextResponse.json({ error: "Missing record_id" }, { status: 400 });
    }

    await shredVaultRecord(recordId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Shred vault record error:", err);
    return NextResponse.json({ error: "Failed to permanently delete record" }, { status: 500 });
  }
}

