import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { inspectionReports, returnEvents } from "@/lib/mongo";

type Rows = RowDataPacket[];

// Reporting queries for the dashboard. Each one demonstrates a different
// SQL technique (scalar subqueries, JOIN + GROUP BY + HAVING, derived
// tables, subquery against an aggregate, conditional aggregation, views).
export async function getSqlAnalytics() {
  const [
    [kpis],
    [returnsByStatus],
    [categoryReturnRates],
    [reasonBreakdown],
    [aboveAverageProducts],
    [monthlyTrend],
    [courierPerformance],
    [repeatReturners],
    [warehouseDispositions],
    [pendingActions],
    [recoveredInventory],
  ] = await Promise.all([
    // KPIs with scalar subqueries
    pool.query<Rows>(`
      SELECT (SELECT COUNT(*) FROM CUSTOMER) AS customers,
             (SELECT COUNT(*) FROM ORDERS) AS orders,
             (SELECT COALESCE(SUM(TotalAmount), 0) FROM ORDERS
               WHERE OrderStatus <> 'Cancelled') AS revenue,
             (SELECT COUNT(*) FROM RETURNS) AS returns,
             (SELECT COUNT(*) FROM RETURNS
               WHERE ReturnStatus NOT IN ('Rejected', 'Refunded', 'Closed')) AS openReturns,
             (SELECT COALESCE(SUM(RefundAmount), 0) FROM REFUND
               WHERE RefundStatus = 'Processed') AS refunded,
             (SELECT ROUND(AVG(DATEDIFF(rd.RefundDate, r.ReturnDate)), 1)
                FROM REFUND rd
                JOIN PICKUP p  ON p.PickupID = rd.PickupID
                JOIN RETURNS r ON r.ReturnID = p.ReturnID
               WHERE rd.RefundStatus = 'Processed') AS avgDaysToRefund`),

    // GROUP BY
    pool.query<Rows>(`
      SELECT ReturnStatus, COUNT(*) AS total
        FROM RETURNS
       GROUP BY ReturnStatus
       ORDER BY FIELD(ReturnStatus, 'Requested', 'Approved', 'Pickup Scheduled',
                      'Picked Up', 'Inspected', 'Refunded', 'Closed', 'Rejected')`),

    // JOIN + derived table + GROUP BY + HAVING
    pool.query<Rows>(`
      SELECT cat.CategoryName,
             SUM(oi.Quantity) AS unitsSold,
             COALESCE(SUM(rq.returned), 0) AS unitsReturned,
             ROUND(100 * COALESCE(SUM(rq.returned), 0) / SUM(oi.Quantity), 1) AS returnRatePct
        FROM CATEGORY cat
        JOIN PRODUCT p     ON p.CategoryID = cat.CategoryID
        JOIN ORDER_ITEM oi ON oi.ProductID = p.ProductID
        JOIN ORDERS o      ON o.OrderID = oi.OrderID AND o.OrderStatus <> 'Cancelled'
        LEFT JOIN (SELECT OrderItemID, SUM(ReturnQty) AS returned
                     FROM RETURNS
                    WHERE ReturnStatus <> 'Rejected'
                    GROUP BY OrderItemID) rq ON rq.OrderItemID = oi.OrderItemID
       GROUP BY cat.CategoryID, cat.CategoryName
      HAVING SUM(oi.Quantity) > 0
       ORDER BY returnRatePct DESC`),

    // Aggregate with a scalar subquery for the percentage
    pool.query<Rows>(`
      SELECT rr.ReasonName,
             rr.IsSellerFault,
             COUNT(*) AS total,
             ROUND(100 * COUNT(*) / (SELECT COUNT(*) FROM RETURNS), 1) AS pct
        FROM RETURNS r
        JOIN RETURN_REASON rr ON rr.ReturnReasonID = r.ReturnReasonID
       GROUP BY rr.ReturnReasonID, rr.ReasonName, rr.IsSellerFault
       ORDER BY total DESC`),

    // Subquery against an aggregate over a view
    pool.query<Rows>(`
      SELECT ProductName, CategoryName, UnitsSold, UnitsReturned, ReturnRatePct
        FROM ProductReturnStatsView
       WHERE ReturnRatePct > (SELECT AVG(ReturnRatePct)
                                FROM ProductReturnStatsView
                               WHERE UnitsSold > 0)
       ORDER BY ReturnRatePct DESC, UnitsReturned DESC`),

    // Time series with conditional aggregation
    pool.query<Rows>(`
      SELECT DATE_FORMAT(r.ReturnDate, '%Y-%m') AS month,
             COUNT(*) AS returns,
             SUM(rr.IsSellerFault) AS sellerFault,
             COALESCE(SUM(CASE WHEN rd.RefundStatus = 'Processed'
                               THEN rd.RefundAmount END), 0) AS refunded
        FROM RETURNS r
        JOIN RETURN_REASON rr ON rr.ReturnReasonID = r.ReturnReasonID
        LEFT JOIN PICKUP p    ON p.ReturnID = r.ReturnID
        LEFT JOIN REFUND rd   ON rd.PickupID = p.PickupID
       GROUP BY month
       ORDER BY month`),

    // LEFT JOIN keeps couriers with no pickups
    pool.query<Rows>(`
      SELECT co.CourierName,
             COUNT(p.PickupID) AS pickups,
             SUM(p.PickupStatus = 'Picked Up') AS completed,
             SUM(p.PickupStatus = 'Failed') AS failed,
             ROUND(AVG(DATEDIFF(p.PickupDate, r.ReturnDate)), 1) AS avgDaysToPickup
        FROM COURIER co
        LEFT JOIN PICKUP p  ON p.CourierID = co.CourierID
        LEFT JOIN RETURNS r ON r.ReturnID = p.ReturnID
       GROUP BY co.CourierID, co.CourierName
       ORDER BY completed DESC`),

    // HAVING on a COUNT
    pool.query<Rows>(`
      SELECT c.CustomerID, c.Name, c.CustomerType,
             COUNT(r.ReturnID) AS returns,
             SUM(r.ReturnQty * oi.UnitPrice) AS returnValue
        FROM CUSTOMER c
        JOIN ORDERS o      ON o.CustomerID = c.CustomerID
        JOIN RETURNS r     ON r.OrderID = o.OrderID
        JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
       GROUP BY c.CustomerID, c.Name, c.CustomerType
      HAVING COUNT(r.ReturnID) >= 2
       ORDER BY returns DESC`),

    pool.query<Rows>("SELECT * FROM WarehouseDispositionView ORDER BY WarehouseName, Disposition"),

    pool.query<Rows>("SELECT * FROM PendingActionsView ORDER BY DaysOpen DESC"),

    pool.query<Rows>(`
      SELECT p.ProductName, w.WarehouseName, i.Quantity, i.UpdatedAt
        FROM INVENTORY i
        JOIN PRODUCT p   ON p.ProductID = i.ProductID
        JOIN WAREHOUSE w ON w.WarehouseID = i.WarehouseID
       ORDER BY i.UpdatedAt DESC`),
  ]);

  return {
    kpis: kpis[0],
    returnsByStatus,
    categoryReturnRates,
    reasonBreakdown,
    aboveAverageProducts,
    monthlyTrend,
    courierPerformance,
    repeatReturners,
    warehouseDispositions,
    pendingActions,
    recoveredInventory,
  };
}

export interface MongoAnalytics {
  defectsByCategory: { category: string; defect: string; count: number; severities: string[] }[];
  conditionByCategory: { category: string; reports: number; avgScore: number; dispositions: string[] }[];
  checklistFailures: { category: string; item: string; checks: number; failures: number; failureRatePct: number }[];
  eventActivity: { type: string; count: number; lastAt: Date }[];
}

// MongoDB aggregation pipelines over the inspection reports and activity feed.
export async function getMongoAnalytics(): Promise<MongoAnalytics> {
  const [reports, events] = await Promise.all([inspectionReports(), returnEvents()]);

  const [defectsByCategory, conditionByCategory, checklistFailures, eventActivity] = await Promise.all([
    // Most frequent defect types per category ($unwind + $group)
    reports
      .aggregate([
        { $unwind: "$defects" },
        {
          $group: {
            _id: { category: "$category", defect: "$defects.type" },
            count: { $sum: 1 },
            severities: { $addToSet: "$defects.severity" },
          },
        },
        { $sort: { count: -1, "_id.category": 1 } },
        { $limit: 10 },
        { $project: { _id: 0, category: "$_id.category", defect: "$_id.defect", count: 1, severities: 1 } },
      ])
      .toArray(),

    // Average condition score per category and the dispositions chosen
    reports
      .aggregate([
        {
          $group: {
            _id: "$category",
            reports: { $sum: 1 },
            avgScore: { $avg: "$conditionScore" },
            dispositions: { $push: "$disposition" },
          },
        },
        { $sort: { avgScore: 1 } },
        {
          $project: {
            _id: 0,
            category: "$_id",
            reports: 1,
            avgScore: { $round: ["$avgScore", 1] },
            dispositions: 1,
          },
        },
      ])
      .toArray(),

    // Which checklist items fail most often ($cond inside $sum)
    reports
      .aggregate([
        { $unwind: "$checklist" },
        {
          $group: {
            _id: { category: "$category", item: "$checklist.item" },
            checks: { $sum: 1 },
            failures: { $sum: { $cond: [{ $eq: ["$checklist.passed", false] }, 1, 0] } },
          },
        },
        { $match: { failures: { $gt: 0 } } },
        {
          $project: {
            _id: 0,
            category: "$_id.category",
            item: "$_id.item",
            checks: 1,
            failures: 1,
            failureRatePct: { $round: [{ $multiply: [{ $divide: ["$failures", "$checks"] }, 100] }, 1] },
          },
        },
        { $sort: { failures: -1, failureRatePct: -1 } },
      ])
      .toArray(),

    // Activity by event type
    events
      .aggregate([
        { $group: { _id: "$type", count: { $sum: 1 }, lastAt: { $max: "$at" } } },
        { $sort: { count: -1 } },
        { $project: { _id: 0, type: "$_id", count: 1, lastAt: 1 } },
      ])
      .toArray(),
  ]);

  return {
    defectsByCategory,
    conditionByCategory,
    checklistFailures,
    eventActivity,
  } as MongoAnalytics;
}
