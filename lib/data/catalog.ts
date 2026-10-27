import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { toBooleanQuery } from "./search";

export interface CustomerRow extends RowDataPacket {
  CustomerID: number;
  Name: string;
  Email: string;
  Phone: string | null;
  Address: string | null;
  CustomerType: string;
  Username: string | null;
  TotalOrders: number;
  TotalSpent: number;
  TotalReturns: number;
  TotalRefunded: number;
}

// Customers with their order / return summary (CustomerReturnSummaryView).
export async function listCustomers(
  filters: { q?: string | null; type?: string | null } = {}
): Promise<CustomerRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.q) {
    where.push("(c.Name LIKE ? OR c.Email LIKE ? OR c.Phone LIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like);
  }
  if (filters.type) {
    where.push("c.CustomerType = ?");
    params.push(filters.type);
  }

  const [rows] = await pool.query<CustomerRow[]>(
    `SELECT c.CustomerID, c.Name, c.Email, c.Phone, c.Address, c.CustomerType,
            u.Username, s.TotalOrders, s.TotalSpent, s.TotalReturns, s.TotalRefunded
       FROM CUSTOMER c
       JOIN CustomerReturnSummaryView s ON s.CustomerID = c.CustomerID
       LEFT JOIN APP_USER u ON u.CustomerID = c.CustomerID
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.CustomerID`,
    params
  );
  return rows;
}

export interface ProductRow extends RowDataPacket {
  ProductID: number;
  ProductName: string;
  SKU: string;
  UnitPrice: number;
  CategoryID: number;
  CategoryName: string;
  UnitsSold: number;
  UnitsReturned: number;
  ReturnRatePct: number | null;
  RecoveredStock: number;
}

// Products with category, return statistics and stock recovered through
// restocking. The text filter uses the FULLTEXT index on ProductName.
export async function listProducts(
  filters: { q?: string | null; categoryId?: number | null } = {}
): Promise<ProductRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  const query = filters.q ? toBooleanQuery(filters.q) : null;
  if (query) {
    where.push("MATCH(p.ProductName) AGAINST (? IN BOOLEAN MODE)");
    params.push(query);
  }
  if (filters.categoryId) {
    where.push("p.CategoryID = ?");
    params.push(filters.categoryId);
  }

  const [rows] = await pool.query<ProductRow[]>(
    `SELECT p.ProductID, p.ProductName, p.SKU, p.UnitPrice, p.CategoryID, c.CategoryName,
            s.UnitsSold, s.UnitsReturned, s.ReturnRatePct,
            COALESCE((SELECT SUM(i.Quantity) FROM INVENTORY i
                       WHERE i.ProductID = p.ProductID), 0) AS RecoveredStock
       FROM PRODUCT p
       JOIN CATEGORY c ON c.CategoryID = p.CategoryID
       JOIN ProductReturnStatsView s ON s.ProductID = p.ProductID
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY p.ProductID`,
    params
  );
  return rows;
}

export interface RefundRow extends RowDataPacket {
  RefundID: number;
  RefundDate: string;
  RefundAmount: number;
  RefundMethod: string;
  RefundStatus: string;
  ReturnID: number;
  CustomerName: string;
  ProductName: string;
  ReturnValue: number;
}

export async function listRefunds(): Promise<RefundRow[]> {
  const [rows] = await pool.query<RefundRow[]>(
    `SELECT RefundID, RefundDate, RefundAmount, RefundMethod, RefundStatus,
            ReturnID, CustomerName, ProductName, ReturnValue
       FROM ReturnPipelineView
      WHERE RefundID IS NOT NULL
      ORDER BY RefundDate DESC, RefundID DESC`
  );
  return rows;
}

export interface PendingRefundRow extends RowDataPacket {
  ReturnID: number;
  PickupID: number;
  CustomerName: string;
  ProductName: string;
  ReasonName: string;
  ProductCondition: string;
  Disposition: string;
  ReturnValue: number;
  RefundDue: number;
}

// Inspected returns waiting for a refund, with the amount the refund policy
// function will pay.
export async function listPendingRefunds(): Promise<PendingRefundRow[]> {
  const [rows] = await pool.query<PendingRefundRow[]>(
    `SELECT ReturnID, PickupID, CustomerName, ProductName, ReasonName,
            ProductCondition, Disposition, ReturnValue,
            fn_calculate_refund(ReturnID) AS RefundDue
       FROM ReturnPipelineView
      WHERE ReturnStatus = 'Inspected' AND RefundID IS NULL
      ORDER BY ReturnID`
  );
  return rows;
}

export interface UserRow extends RowDataPacket {
  UserID: number;
  Username: string;
  Role: string;
  CustomerID: number | null;
  CustomerName: string | null;
  IsActive: number;
  CreatedAt: string;
}

export async function listUsers(): Promise<UserRow[]> {
  const [rows] = await pool.query<UserRow[]>(
    `SELECT u.UserID, u.Username, u.Role, u.CustomerID, c.Name AS CustomerName,
            u.IsActive, u.CreatedAt
       FROM APP_USER u
       LEFT JOIN CUSTOMER c ON c.CustomerID = u.CustomerID
      ORDER BY FIELD(u.Role, 'Admin', 'Staff', 'Customer'), u.Username`
  );
  return rows;
}
