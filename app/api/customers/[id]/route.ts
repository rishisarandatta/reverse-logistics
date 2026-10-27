import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool, { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toRequiredText, toText } from "@/lib/http";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/customers/[id]">) {
  try {
    const session = await requireApiSession();
    const customerId = idParam((await ctx.params).id);

    // Customers may only read their own record.
    if (session.role === "Customer" && session.customerId !== customerId) {
      throw new HttpError(404, "Customer not found.");
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM CustomerReturnSummaryView WHERE CustomerID = ?",
      [customerId]
    );
    if (rows.length === 0) throw new HttpError(404, "Customer not found.");

    const [orders] = await pool.query<RowDataPacket[][]>("CALL GetCustomerOrders(?)", [customerId]);

    return NextResponse.json({ customer: rows[0], orders: orders[0] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/customers/[id]">) {
  try {
    await requireApiSession("Admin");
    const customerId = idParam((await ctx.params).id);
    const body = await readJson(request);

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE CUSTOMER
          SET Name = ?, Email = ?, Phone = ?, Address = ?, CustomerType = ?
        WHERE CustomerID = ?`,
      [
        toRequiredText(body.name, "Name", 100),
        toRequiredText(body.email, "Email", 100),
        toText(body.phone, "Phone", { max: 20 }),
        toText(body.address, "Address"),
        toRequiredText(body.customerType, "Customer type", 30),
        customerId,
      ]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "Customer not found.");

    return NextResponse.json({ message: "Customer updated." });
  } catch (error) {
    return errorResponse(error);
  }
}

// Deleting a customer also removes their login, in one transaction. If the
// customer has orders, the ORDERS foreign key (ON DELETE RESTRICT) makes
// MySQL refuse, the transaction rolls back and the login is kept too.
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/customers/[id]">) {
  try {
    const session = await requireApiSession("Admin");
    const customerId = idParam((await ctx.params).id);

    await withTransaction(session.userId, async (connection) => {
      await connection.query("DELETE FROM APP_USER WHERE CustomerID = ?", [customerId]);
      const [result] = await connection.query<ResultSetHeader>(
        "DELETE FROM CUSTOMER WHERE CustomerID = ?",
        [customerId]
      );
      if (result.affectedRows === 0) throw new HttpError(404, "Customer not found.");
    });

    return NextResponse.json({ message: "Customer deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}
