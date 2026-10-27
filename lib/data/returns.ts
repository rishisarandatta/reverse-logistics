import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { isStaff, type Session } from "@/lib/auth";
import { inspectionReports, returnEvents, type InspectionReport, type ReturnEvent } from "@/lib/mongo";
import { toBooleanQuery } from "./search";

export const RETURN_STATUSES = [
  "Requested",
  "Approved",
  "Rejected",
  "Pickup Scheduled",
  "Picked Up",
  "Inspected",
  "Refunded",
  "Closed",
] as const;

export interface ReturnRow extends RowDataPacket {
  ReturnID: number;
  ReturnDate: string;
  ReturnStatus: string;
  ReturnQty: number;
  Comments: string | null;
  OrderID: number;
  OrderItemID: number;
  CustomerID: number;
  CustomerName: string;
  CustomerAddress: string | null;
  ProductID: number;
  ProductName: string;
  CategoryName: string;
  UnitPrice: number;
  ReturnValue: number;
  ReasonName: string;
  IsSellerFault: number;
  PickupID: number | null;
  PickupDate: string | null;
  PickupStatus: string | null;
  CourierName: string | null;
  InspectionID: number | null;
  InspectionDate: string | null;
  ProductCondition: string | null;
  InspectionRemarks: string | null;
  Disposition: string | null;
  WarehouseName: string | null;
  RefundID: number | null;
  RefundDate: string | null;
  RefundAmount: number | null;
  RefundMethod: string | null;
  RefundStatus: string | null;
  DaysOpen: number;
}

// Lists returns from ReturnPipelineView. Customers only ever see their own
// rows; the optional text filter uses the FULLTEXT indexes on return
// comments and inspection remarks.
export async function listReturns(
  session: Session,
  filters: { status?: string | null; q?: string | null } = {}
): Promise<ReturnRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (!isStaff(session)) {
    where.push("v.CustomerID = ?");
    params.push(session.customerId);
  }

  if (filters.status) {
    where.push("v.ReturnStatus = ?");
    params.push(filters.status);
  }

  const query = filters.q ? toBooleanQuery(filters.q) : null;
  if (query) {
    where.push(`v.ReturnID IN (
        SELECT ReturnID FROM RETURNS WHERE MATCH(Comments) AGAINST (? IN BOOLEAN MODE)
        UNION
        SELECT ReturnID FROM INSPECTION WHERE MATCH(Remarks) AGAINST (? IN BOOLEAN MODE)
      )`);
    params.push(query, query);
  }

  const [rows] = await pool.query<ReturnRow[]>(
    `SELECT v.*
       FROM ReturnPipelineView v
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY v.ReturnID DESC`,
    params
  );
  return rows;
}

// Number of returns per status (customers: only their own).
export async function countReturnsByStatus(session: Session): Promise<Record<string, number>> {
  const params: unknown[] = [];
  let filter = "";
  if (!isStaff(session)) {
    filter = "WHERE o.CustomerID = ?";
    params.push(session.customerId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.ReturnStatus, COUNT(*) AS total
       FROM RETURNS r
       JOIN ORDERS o ON o.OrderID = r.OrderID
      ${filter}
      GROUP BY r.ReturnStatus`,
    params
  );
  return Object.fromEntries(rows.map((row) => [row.ReturnStatus, Number(row.total)]));
}

// True when the return exists and the user may see it (staff: any return,
// customer: only returns on their own orders).
export async function canAccessReturn(returnId: number, session: Session): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.CustomerID
       FROM RETURNS r JOIN ORDERS o ON o.OrderID = r.OrderID
      WHERE r.ReturnID = ?`,
    [returnId]
  );
  if (rows.length === 0) return false;
  return isStaff(session) || rows[0].CustomerID === session.customerId;
}

export interface StatusHistoryRow extends RowDataPacket {
  HistoryID: number;
  OldStatus: string | null;
  NewStatus: string;
  ChangedAt: string;
  ChangedBy: string | null;
}

export interface ReturnDetail {
  pipeline: ReturnRow;
  history: StatusHistoryRow[];
  refundPreview: number | null;
  events: ReturnEvent[];
  report: InspectionReport | null;
  mongoError?: string;
}

// Everything about one return, combined from both databases:
//   MySQL   -> pipeline row (view), audit history (trigger-written table),
//              refund preview (stored function)
//   MongoDB -> activity feed and detailed inspection report
// Returns null when the return does not exist or belongs to another customer.
export async function getReturnDetail(returnId: number, session: Session): Promise<ReturnDetail | null> {
  const [rows] = await pool.query<ReturnRow[]>(
    "SELECT * FROM ReturnPipelineView WHERE ReturnID = ?",
    [returnId]
  );
  const pipeline = rows[0];
  if (!pipeline) return null;
  if (!isStaff(session) && pipeline.CustomerID !== session.customerId) return null;

  const [[history], [preview]] = await Promise.all([
    pool.query<StatusHistoryRow[]>(
      `SELECT h.HistoryID, h.OldStatus, h.NewStatus, h.ChangedAt, u.Username AS ChangedBy
         FROM RETURN_STATUS_HISTORY h
         LEFT JOIN APP_USER u ON u.UserID = h.ChangedBy
        WHERE h.ReturnID = ?
        ORDER BY h.ChangedAt, h.HistoryID`,
      [returnId]
    ),
    pool.query<RowDataPacket[]>("SELECT fn_calculate_refund(?) AS amount", [returnId]),
  ]);

  let events: ReturnEvent[] = [];
  let report: InspectionReport | null = null;
  let mongoError: string | undefined;
  try {
    const [eventCollection, reportCollection] = await Promise.all([returnEvents(), inspectionReports()]);
    [events, report] = await Promise.all([
      eventCollection.find({ returnId }, { projection: { _id: 0 } }).sort({ at: 1 }).toArray(),
      reportCollection.findOne({ returnId }, { projection: { _id: 0 } }),
    ]);
  } catch (error) {
    console.error("MongoDB read failed:", error);
    mongoError = "MongoDB is unavailable: activity feed and inspection report could not be loaded.";
  }

  return {
    pipeline,
    history,
    refundPreview: preview[0]?.amount ?? null,
    events,
    report,
    mongoError,
  };
}

export interface ReturnableItem extends RowDataPacket {
  OrderItemID: number;
  OrderID: number;
  OrderDate: string;
  CustomerID: number;
  CustomerName: string;
  ProductName: string;
  Quantity: number;
  ReturnableQty: number;
  LastReturnDate: string;
}

// Order lines that can still be returned: delivered, inside the 30-day
// window, and with units not already covered by another (non-rejected)
// return. The triggers enforce the same rules on insert; this query only
// keeps the dropdown honest.
export async function listReturnableItems(session: Session): Promise<ReturnableItem[]> {
  const params: unknown[] = [];
  let customerFilter = "";
  if (!isStaff(session)) {
    customerFilter = "AND o.CustomerID = ?";
    params.push(session.customerId);
  }

  const [rows] = await pool.query<ReturnableItem[]>(
    `SELECT oi.OrderItemID, o.OrderID, o.OrderDate, o.CustomerID, c.Name AS CustomerName,
            p.ProductName, oi.Quantity,
            oi.Quantity - COALESCE((SELECT SUM(r.ReturnQty) FROM RETURNS r
                                     WHERE r.OrderItemID = oi.OrderItemID
                                       AND r.ReturnStatus <> 'Rejected'), 0) AS ReturnableQty,
            DATE_ADD(o.OrderDate, INTERVAL 30 DAY) AS LastReturnDate
       FROM ORDER_ITEM oi
       JOIN ORDERS o   ON o.OrderID = oi.OrderID
       JOIN CUSTOMER c ON c.CustomerID = o.CustomerID
       JOIN PRODUCT p  ON p.ProductID = oi.ProductID
      WHERE o.OrderStatus = 'Delivered'
        AND CURRENT_DATE <= DATE_ADD(o.OrderDate, INTERVAL 30 DAY)
        ${customerFilter}
     HAVING ReturnableQty > 0
      ORDER BY o.OrderDate DESC, oi.OrderItemID`,
    params
  );
  return rows;
}
