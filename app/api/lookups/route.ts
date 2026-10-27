import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { getLookups } from "@/lib/data/lookups";

// Categories, return reasons, couriers and warehouses for dropdowns.
export async function GET() {
  try {
    await requireApiSession();
    return NextResponse.json(await getLookups());
  } catch (error) {
    return errorResponse(error);
  }
}
