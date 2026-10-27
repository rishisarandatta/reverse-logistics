import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toRequiredText } from "@/lib/http";
import { listOrderLines } from "@/lib/data/orders";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    const session = await requireApiSession();
    const orderId = idParam((await ctx.params).id);

    // listOrderLines already restricts customers to their own orders.
    const lines = await listOrderLines(session, orderId);
    if (lines.length === 0) throw new HttpError(404, "Order not found.");

    return NextResponse.json({ order: lines });
  } catch (error) {
    return errorResponse(error);
  }
}

// Staff update the order status; the allowed values are a CHECK constraint.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) {
  try {
    await requireApiSession("Admin", "Staff");
    const orderId = idParam((await ctx.params).id);
    const body = await readJson(request);

    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE ORDERS SET OrderStatus = ? WHERE OrderID = ?",
      [toRequiredText(body.status, "Status", 50), orderId]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "Order not found.");

    return NextResponse.json({ message: "Order status updated." });
  } catch (error) {
    return errorResponse(error);
  }
}
