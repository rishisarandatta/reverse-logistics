import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

interface OrderItemRow extends RowDataPacket {
  OrderID: number;
}

export async function POST(request: Request) {
  let connection;

  try {
    const { orderItemId, reason, comments } = await request.json();

    if (!orderItemId || !reason) {
      return NextResponse.json(
        { error: "Order Item ID and return reason are required." },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check that the order item exists
    const [items] = await connection.query<OrderItemRow[]>(
      `SELECT OrderID
       FROM ORDER_ITEM
       WHERE OrderItemID = ?
       FOR UPDATE`,
      [Number(orderItemId)]
    );

    if (items.length === 0) {
      await connection.rollback();

      return NextResponse.json(
        { error: "Order Item ID does not exist." },
        { status: 404 }
      );
    }

    const orderId = items[0].OrderID;

    // Generate a return ID
    const [idRows] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(ReturnID), 0) + 1 AS nextId
       FROM RETURNS`
    );

    const returnId = Number(idRows[0].nextId);

    // Save the return
    await connection.query<ResultSetHeader>(
      `INSERT INTO RETURNS
       (ReturnID, OrderItemID, ReturnDate, ReturnReasonID,
        ReturnStatus, Comments, OrderID)
       VALUES (?, ?, CURDATE(), ?, 'Pending', ?, ?)`,
      [
        returnId,
        Number(orderItemId),
        Number(reason),
        comments || null,
        orderId,
      ]
    );

    await connection.commit();

    return NextResponse.json(
      { message: "Return registered successfully!" },
      { status: 201 }
    );
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("Return API error:", error);

    return NextResponse.json(
      { error: "Failed to register return." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}