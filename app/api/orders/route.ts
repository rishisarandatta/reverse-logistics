import { NextResponse } from "next/server";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

export async function POST(request: Request) {
  let connection: PoolConnection | undefined;
  let transactionStarted = false;

  try {
    const body = await request.json();

    const customerId = Number(body.customerId);
    const paymentMethod = String(body.paymentMethod || "").trim();
    const items = body.items;

    // Validate customer and order details
    if (
      !Number.isInteger(customerId) ||
      customerId <= 0 ||
      !paymentMethod ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid customer, payment method, or order items." },
        { status: 400 }
      );
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    // Check whether customer exists
    const [customers] = await connection.query<RowDataPacket[]>(
      "SELECT CustomerID FROM CUSTOMER WHERE CustomerID = ?",
      [customerId]
    );

    if (customers.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 }
      );
    }

    // Validate products and calculate total using database prices
    let totalAmount = 0;

    const validatedItems: {
      productId: number;
      quantity: number;
      unitPrice: number;
    }[] = [];

    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error("Invalid product or quantity.");
      }

      // Your PRODUCT table uses UnitPrice
      const [products] = await connection.query<RowDataPacket[]>(
        "SELECT ProductID, UnitPrice FROM PRODUCT WHERE ProductID = ?",
        [productId]
      );

      if (products.length === 0) {
        throw new Error(`Product ${productId} not found.`);
      }

      const unitPrice = Number(products[0].UnitPrice);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error("Invalid product price.");
      }

      totalAmount += unitPrice * quantity;

      validatedItems.push({
        productId,
        quantity,
        unitPrice,
      });
    }

    // Generate the next order ID using the current manual-ID schema
    const [orderIds] = await connection.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(OrderID), 0) + 1 AS nextId FROM ORDERS"
    );

    const orderId = Number(orderIds[0].nextId);

    // Insert order
    await connection.query(
      `INSERT INTO ORDERS
       (OrderID, CustomerID, OrderDate, TotalAmount, PaymentMethod, OrderStatus)
       VALUES (?, ?, CURRENT_DATE, ?, ?, ?)`,
      [
        orderId,
        customerId,
        totalAmount,
        paymentMethod,
        "Placed",
      ]
    );

    // Insert all order items
    for (const item of validatedItems) {
      const [itemIds] = await connection.query<RowDataPacket[]>(
        "SELECT COALESCE(MAX(OrderItemID), 0) + 1 AS nextId FROM ORDER_ITEM"
      );

      const orderItemId = Number(itemIds[0].nextId);

      await connection.query(
        `INSERT INTO ORDER_ITEM
         (OrderItemID, OrderID, ProductID, Quantity, UnitPrice)
         VALUES (?, ?, ?, ?, ?)`,
        [
          orderItemId,
          orderId,
          item.productId,
          item.quantity,
          item.unitPrice,
        ]
      );
    }

    await connection.commit();
    transactionStarted = false;

    return NextResponse.json(
      {
        message: "Order created successfully.",
        orderId,
        totalAmount,
      },
      { status: 201 }
    );
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Order creation failed:", error);

    return NextResponse.json(
      { error: "Order creation failed. Transaction rolled back." },
      { status: 500 }
    );
  } finally {
    connection?.release();
  }
}