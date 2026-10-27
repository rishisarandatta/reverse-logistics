import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { errorResponse, readJson, toPositiveInt, toText } from "@/lib/http";
import { logReturnEvent } from "@/lib/mongo";
import { listReturns } from "@/lib/data/returns";

// ?status= filters by workflow status, ?q= runs a full-text search over
// return comments and inspection remarks. Customers see only their own.
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession();
    const params = request.nextUrl.searchParams;
    const returns = await listReturns(session, {
      status: params.get("status"),
      q: params.get("q"),
    });
    return NextResponse.json({ returns });
  } catch (error) {
    return errorResponse(error);
  }
}

// Registers a return through the sp_register_return stored procedure.
// Ownership is checked by the procedure; the 30-day window, delivered-only
// and quantity rules by trg_returns_before_insert.
export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    const body = await readJson(request);

    const orderItemId = toPositiveInt(body.orderItemId, "Order item");
    const reasonId = toPositiveInt(body.reasonId, "Return reason");
    const quantity = toPositiveInt(body.quantity ?? 1, "Quantity");
    const comments = toText(body.comments, "Comments", { max: 500 });

    const returnId = await withTransaction(session.userId, async (connection) => {
      await connection.query("CALL sp_register_return(?, ?, ?, ?, ?, @return_id)", [
        orderItemId,
        reasonId,
        quantity,
        comments,
        session.role === "Customer" ? session.customerId : null,
      ]);
      const [rows] = await connection.query<RowDataPacket[]>("SELECT @return_id AS returnId");
      return Number(rows[0].returnId);
    });

    await logReturnEvent({
      returnId,
      type: "REQUEST_CREATED",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message: "Return requested",
      data: { orderItemId, reasonId, quantity, comments: comments ?? "" },
    });

    return NextResponse.json(
      { message: "Return registered successfully.", returnId },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
