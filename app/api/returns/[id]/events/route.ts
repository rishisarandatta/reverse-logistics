import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toRequiredText } from "@/lib/http";
import { returnEvents } from "@/lib/mongo";
import { canAccessReturn } from "@/lib/data/returns";

// Adds a message to the return's activity feed (MongoDB). Customers post
// CUSTOMER_MESSAGE events, staff post STAFF_NOTE events.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/returns/[id]/events">) {
  try {
    const session = await requireApiSession();
    const returnId = idParam((await ctx.params).id);
    const body = await readJson(request);
    const message = toRequiredText(body.message, "Message", 1000);

    // Customers can only post on their own returns.
    if (!(await canAccessReturn(returnId, session))) {
      throw new HttpError(404, "Return not found.");
    }

    const events = await returnEvents();
    await events.insertOne({
      returnId,
      type: session.role === "Customer" ? "CUSTOMER_MESSAGE" : "STAFF_NOTE",
      at: new Date(),
      actor: { userId: session.userId, username: session.username, role: session.role },
      message,
      data: {},
    });

    return NextResponse.json({ message: "Message added." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
