import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { datakeyConfig } from "@config/datakey.config";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron trigger" }, { status: 401 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const retentionDays = datakeyConfig.security.retention.recycleBinRetentionDays;

    const { data, error } = await supabaseAdmin.rpc("purge_expired_retention", {
      retention_days: retentionDays,
    });

    if (error) {
      console.error("Purge retention RPC error:", error);
      return NextResponse.json({ error: "Purge failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      retentionDays,
      purged: data,
    });
  } catch (err: unknown) {
    console.error("Cron purge retention error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
