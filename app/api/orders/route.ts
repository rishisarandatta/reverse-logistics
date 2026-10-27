import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, readJson, toPositiveInt, toRequiredText } from "@/lib/http";
import { listOrderLines } from "@/lib/data/orders";

export async function GET() {
  try {
    const session = await requireApiSession();
    return NextResponse.json({ orders: await listOrderLines(session) });
  } catch (error) {
    return errorResponse(error);
  }
}

// Places an order with one or more items as a single transaction.
// Prices are read from PRODUCT (never trusted from the client) and
// ORDERS.TotalAmount is maintained by the ORDER_ITEM triggers. If any item
// is invalid, the whole order is rolled back.
export async function POST(request: Request) {
  try {
    const session = await requireApiSession();
    const body = await readJson(request);

    // Customers always order for themselves; staff can order for anyone.
    const customerId =
      session.role === "Customer"
        ? (session.customerId as number)
        : toPositiveInt(body.customerId, "Customer");
    const paymentMethod = toRequiredText(body.paymentMethod, "Payment method", 50);

    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new HttpError(400, "An order needs at least one item.");
    }
    const items = body.items.map((item: { productId?: unknown; quantity?: unknown }) => ({
      productId: toPositiveInt(item?.productId, "Product"),
      quantity: toPositiveInt(item?.quantity, "Quantity"),
    }));

    const order = await withTransaction(session.userId, async (connection) => {
      const [orderResult] = await connection.query<ResultSetHeader>(
        `INSERT INTO ORDERS (OrderDate, PaymentMethod, OrderStatus, CustomerID)
         VALUES (CURRENT_DATE, ?, 'Placed', ?)`,
        [paymentMethod, customerId]
      );
      const orderId = orderResult.insertId;

      for (const item of items) {
        // INSERT ... SELECT copies the current catalogue price; zero rows
        // inserted means the product does not exist.
        const [itemResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO ORDER_ITEM (OrderID, ProductID, Quantity, UnitPrice)
           SELECT ?, ProductID, ?, UnitPrice FROM PRODUCT WHERE ProductID = ?`,
          [orderId, item.quantity, item.productId]
        );
        if (itemResult.affectedRows === 0) {
          throw new HttpError(400, `Product ${item.productId} does not exist.`);
        }
      }

      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT TotalAmount FROM ORDERS WHERE OrderID = ?",
        [orderId]
      );
      return { orderId, totalAmount: Number(rows[0].TotalAmount) };
    });

    return NextResponse.json({ message: "Order created successfully.", ...order }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
