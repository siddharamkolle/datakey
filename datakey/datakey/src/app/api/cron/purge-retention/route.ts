import { NextRequest, NextResponse } from "next/server";
import { datakeyConfig } from "@config/datakey.config";
import { purgeExpiredRecords } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron trigger" }, { status: 401 });
    }

    const retentionDays = datakeyConfig.security.retention.recycleBinRetentionDays;
    const purged = await purgeExpiredRecords(retentionDays);

    return NextResponse.json({
      success: true,
      retentionDays,
      purged,
    });
  } catch (err) {
    console.error("Cron purge retention error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
