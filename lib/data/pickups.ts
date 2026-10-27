import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";

export const PICKUP_STATUSES = ["Scheduled", "Picked Up", "Failed", "Cancelled"] as const;

export interface PickupRow extends RowDataPacket {
  PickupID: number;
  ReturnID: number;
  PickupDate: string;
  PickupAddress: string;
  PickupStatus: string;
  CourierID: number;
  CourierName: string;
  CustomerName: string;
  ProductName: string;
  ReturnStatus: string;
}

// All courier pickups with the return, customer and product they belong to.
// Open pickups (Scheduled, then Failed / Cancelled) come first.
export async function listPickups(filters: { status?: string | null; courierId?: number | null } = {}): Promise<PickupRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    where.push("p.PickupStatus = ?");
    params.push(filters.status);
  }
  if (filters.courierId) {
    where.push("p.CourierID = ?");
    params.push(filters.courierId);
  }

  const [rows] = await pool.query<PickupRow[]>(
    `SELECT p.PickupID, p.ReturnID, p.PickupDate, p.PickupAddress, p.PickupStatus,
            co.CourierID, co.CourierName, c.Name AS CustomerName,
            pr.ProductName, r.ReturnStatus
       FROM PICKUP p
       JOIN COURIER co    ON co.CourierID = p.CourierID
       JOIN RETURNS r     ON r.ReturnID = p.ReturnID
       JOIN ORDERS o      ON o.OrderID = r.OrderID
       JOIN CUSTOMER c    ON c.CustomerID = o.CustomerID
       JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
       JOIN PRODUCT pr    ON pr.ProductID = oi.ProductID
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY FIELD(p.PickupStatus, 'Scheduled', 'Failed', 'Cancelled', 'Picked Up'),
               p.PickupDate DESC`,
    params
  );
  return rows;
}

export async function countPickupsByStatus(): Promise<Record<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT PickupStatus, COUNT(*) AS total FROM PICKUP GROUP BY PickupStatus"
  );
  return Object.fromEntries(rows.map((row) => [row.PickupStatus, Number(row.total)]));
}

export interface AwaitingPickupRow extends RowDataPacket {
  ReturnID: number;
  ReturnDate: string;
  CustomerName: string;
  CustomerAddress: string | null;
  ProductName: string;
}

// Approved returns that still need a courier booked.
export async function listAwaitingPickup(): Promise<AwaitingPickupRow[]> {
  const [rows] = await pool.query<AwaitingPickupRow[]>(
    `SELECT ReturnID, ReturnDate, CustomerName, CustomerAddress, ProductName
       FROM ReturnPipelineView
      WHERE ReturnStatus = 'Approved' AND PickupID IS NULL
      ORDER BY ReturnDate`
  );
  return rows;
}
