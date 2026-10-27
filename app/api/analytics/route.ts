import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { getMongoAnalytics, getSqlAnalytics } from "@/lib/data/analytics";

// Dashboard data: SQL reporting queries + MongoDB aggregation pipelines.
export async function GET() {
  try {
    await requireApiSession("Admin", "Staff");
    const [sql, mongo] = await Promise.all([
      getSqlAnalytics(),
      getMongoAnalytics().catch((error) => {
        console.error("MongoDB analytics failed:", error);
        return null;
      }),
    ]);
    return NextResponse.json({ sql, mongo });
  } catch (error) {
    return errorResponse(error);
  }
}
