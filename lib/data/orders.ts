import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { isStaff, type Session } from "@/lib/auth";

export const ORDER_STATUSES = ["Placed", "Shipped", "Delivered", "Cancelled"] as const;
export const PAYMENT_METHODS = ["Cash", "UPI", "Card", "NetBanking"] as const;

export interface OrderLine extends RowDataPacket {
  OrderID: number;
  CustomerID: number;
  CustomerName: string;
  OrderItemID: number;
  ProductID: number;
  ProductName: string;
  CategoryName: string;
  Quantity: number;
  UnitPrice: number;
  LineTotal: number;
  TotalAmount: number;
  OrderDate: string;
  PaymentMethod: string;
  OrderStatus: string;
}

// Order lines from OrderDetailsView; customers see only their own orders.
export async function listOrderLines(session: Session, orderId?: number): Promise<OrderLine[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!isStaff(session)) {
    where.push("CustomerID = ?");
    params.push(session.customerId);
  }
  if (orderId) {
    where.push("OrderID = ?");
    params.push(orderId);
  }

  const [rows] = await pool.query<OrderLine[]>(
    `SELECT * FROM OrderDetailsView
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY OrderDate DESC, OrderID DESC, OrderItemID`,
    params
  );
  return rows;
}

export interface CustomerOption extends RowDataPacket {
  CustomerID: number;
  Name: string;
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  const [rows] = await pool.query<CustomerOption[]>(
    "SELECT CustomerID, Name FROM CUSTOMER ORDER BY Name"
  );
  return rows;
}
