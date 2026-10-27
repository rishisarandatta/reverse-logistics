import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const { userId, username, role, customerId } = await requireApiSession();
    return NextResponse.json({ user: { userId, username, role, customerId } });
  } catch (error) {
    return errorResponse(error);
  }
}
