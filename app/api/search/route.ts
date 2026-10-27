import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { errorResponse, toRequiredText } from "@/lib/http";
import { searchEverything } from "@/lib/data/search";

// Cross-database search: MySQL FULLTEXT + MongoDB $text.
export async function GET(request: NextRequest) {
  try {
    await requireApiSession("Admin", "Staff");
    const q = toRequiredText(request.nextUrl.searchParams.get("q"), "q", 200);
    return NextResponse.json(await searchEverything(q));
  } catch (error) {
    return errorResponse(error);
  }
}
