-- =====================================================================
-- 05_views.sql : views
--
-- Views hide multi-table joins behind simple, reusable "virtual tables".
-- The API reads from these instead of repeating long joins, and they give
-- the dashboard its aggregated figures.
-- =====================================================================

USE ReverseLogisticsDB;

DROP VIEW IF EXISTS OrderDetailsView;
DROP VIEW IF EXISTS ReturnPipelineView;
DROP VIEW IF EXISTS PendingActionsView;
DROP VIEW IF EXISTS ProductReturnStatsView;
DROP VIEW IF EXISTS CustomerReturnSummaryView;
DROP VIEW IF EXISTS WarehouseDispositionView;

-- ---------------------------------------------------------------------
-- OrderDetailsView: one row per order line with customer and product.
-- ---------------------------------------------------------------------
CREATE VIEW OrderDetailsView AS
SELECT o.OrderID,
       o.CustomerID,
       c.Name            AS CustomerName,
       oi.OrderItemID,
       p.ProductID,
       p.ProductName,
       cat.CategoryName,
       oi.Quantity,
       oi.UnitPrice,
       oi.Quantity * oi.UnitPrice AS LineTotal,
       o.TotalAmount,
       o.OrderDate,
       o.PaymentMethod,
       o.OrderStatus
  FROM ORDERS o
  JOIN CUSTOMER c    ON c.CustomerID = o.CustomerID
  JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
  JOIN PRODUCT p     ON p.ProductID = oi.ProductID
  JOIN CATEGORY cat  ON cat.CategoryID = p.CategoryID;

-- ---------------------------------------------------------------------
-- ReturnPipelineView: the complete life of every return in one row
-- (request -> pickup -> inspection -> disposition -> refund).
-- LEFT JOINs keep returns that have not reached later stages yet.
-- ---------------------------------------------------------------------
CREATE VIEW ReturnPipelineView AS
SELECT r.ReturnID,
       r.ReturnDate,
       r.ReturnStatus,
       r.ReturnQty,
       r.Comments,
       r.OrderID,
       r.OrderItemID,
       o.OrderDate,
       c.CustomerID,
       c.Name                    AS CustomerName,
       c.Address                 AS CustomerAddress,
       p.ProductID,
       p.ProductName,
       cat.CategoryName,
       oi.UnitPrice,
       r.ReturnQty * oi.UnitPrice AS ReturnValue,
       rr.ReturnReasonID,
       rr.ReasonName,
       rr.IsSellerFault,
       pk.PickupID,
       pk.PickupDate,
       pk.PickupStatus,
       co.CourierID,
       co.CourierName,
       i.InspectionID,
       i.InspectionDate,
       i.ProductCondition,
       i.Remarks                 AS InspectionRemarks,
       CASE
           WHEN rs.RestockID   IS NOT NULL THEN 'Restock'
           WHEN rf.RefurbishID IS NOT NULL THEN 'Refurbish'
           WHEN d.DisposeID    IS NOT NULL THEN 'Dispose'
           WHEN rj.RejectID    IS NOT NULL THEN 'Reject'
       END                       AS Disposition,
       w.WarehouseID,
       w.WarehouseName,
       rd.RefundID,
       rd.RefundDate,
       rd.RefundAmount,
       rd.RefundMethod,
       rd.RefundStatus,
       DATEDIFF(COALESCE(rd.RefundDate, CURRENT_DATE), r.ReturnDate) AS DaysOpen
  FROM RETURNS r
  JOIN ORDER_ITEM oi    ON oi.OrderItemID = r.OrderItemID
  JOIN ORDERS o         ON o.OrderID = r.OrderID
  JOIN CUSTOMER c       ON c.CustomerID = o.CustomerID
  JOIN PRODUCT p        ON p.ProductID = oi.ProductID
  JOIN CATEGORY cat     ON cat.CategoryID = p.CategoryID
  JOIN RETURN_REASON rr ON rr.ReturnReasonID = r.ReturnReasonID
  LEFT JOIN PICKUP pk      ON pk.ReturnID = r.ReturnID
  LEFT JOIN COURIER co     ON co.CourierID = pk.CourierID
  LEFT JOIN INSPECTION i   ON i.ReturnID = r.ReturnID
  LEFT JOIN RESTOCK rs     ON rs.InspectionID = i.InspectionID
  LEFT JOIN REFURBISH rf   ON rf.InspectionID = i.InspectionID
  LEFT JOIN DISPOSE d      ON d.InspectionID = i.InspectionID
  LEFT JOIN REJECT rj      ON rj.InspectionID = i.InspectionID
  LEFT JOIN WAREHOUSE w    ON w.WarehouseID = COALESCE(rs.WarehouseID, rf.WarehouseID, d.WarehouseID)
  LEFT JOIN REFUND rd      ON rd.PickupID = pk.PickupID;

-- ---------------------------------------------------------------------
-- PendingActionsView: the staff work queue - every open return and the
-- next action it needs.
-- ---------------------------------------------------------------------
CREATE VIEW PendingActionsView AS
SELECT ReturnID,
       ReturnDate,
       CustomerName,
       ProductName,
       ReturnStatus,
       CASE ReturnStatus
           WHEN 'Requested'        THEN 'Review request'
           WHEN 'Approved'         THEN 'Schedule pickup'
           WHEN 'Pickup Scheduled' THEN 'Confirm pickup'
           WHEN 'Picked Up'        THEN 'Inspect item'
           WHEN 'Inspected'        THEN 'Process refund'
       END AS NextAction,
       DaysOpen
  FROM ReturnPipelineView
 WHERE ReturnStatus IN ('Requested', 'Approved', 'Pickup Scheduled',
                        'Picked Up', 'Inspected');

-- ---------------------------------------------------------------------
-- ProductReturnStatsView: units sold vs returned and refund value per
-- product (derived tables + GROUP BY).
-- ---------------------------------------------------------------------
CREATE VIEW ProductReturnStatsView AS
SELECT p.ProductID,
       p.ProductName,
       cat.CategoryName,
       COALESCE(s.UnitsSold, 0)                  AS UnitsSold,
       COALESCE(rt.UnitsReturned, 0)             AS UnitsReturned,
       ROUND(100 * COALESCE(rt.UnitsReturned, 0)
                 / NULLIF(s.UnitsSold, 0), 2)    AS ReturnRatePct,
       COALESCE(rt.RefundTotal, 0)               AS RefundTotal
  FROM PRODUCT p
  JOIN CATEGORY cat ON cat.CategoryID = p.CategoryID
  LEFT JOIN (
        SELECT oi.ProductID, SUM(oi.Quantity) AS UnitsSold
          FROM ORDER_ITEM oi
          JOIN ORDERS o ON o.OrderID = oi.OrderID
         WHERE o.OrderStatus <> 'Cancelled'
         GROUP BY oi.ProductID
       ) s ON s.ProductID = p.ProductID
  LEFT JOIN (
        SELECT oi.ProductID,
               SUM(r.ReturnQty) AS UnitsReturned,
               SUM(CASE WHEN rd.RefundStatus = 'Processed'
                        THEN rd.RefundAmount ELSE 0 END) AS RefundTotal
          FROM RETURNS r
          JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
          LEFT JOIN PICKUP pk ON pk.ReturnID = r.ReturnID
          LEFT JOIN REFUND rd ON rd.PickupID = pk.PickupID
         WHERE r.ReturnStatus <> 'Rejected'
         GROUP BY oi.ProductID
       ) rt ON rt.ProductID = p.ProductID;

-- ---------------------------------------------------------------------
-- CustomerReturnSummaryView: order and return behaviour per customer.
-- ---------------------------------------------------------------------
CREATE VIEW CustomerReturnSummaryView AS
SELECT c.CustomerID,
       c.Name,
       c.CustomerType,
       (SELECT COUNT(*) FROM ORDERS o WHERE o.CustomerID = c.CustomerID) AS TotalOrders,
       (SELECT COALESCE(SUM(o.TotalAmount), 0) FROM ORDERS o
         WHERE o.CustomerID = c.CustomerID AND o.OrderStatus <> 'Cancelled') AS TotalSpent,
       (SELECT COUNT(*) FROM RETURNS r
          JOIN ORDERS o ON o.OrderID = r.OrderID
         WHERE o.CustomerID = c.CustomerID) AS TotalReturns,
       (SELECT COALESCE(SUM(rd.RefundAmount), 0)
          FROM REFUND rd
          JOIN PICKUP pk ON pk.PickupID = rd.PickupID
          JOIN RETURNS r ON r.ReturnID = pk.ReturnID
          JOIN ORDERS o  ON o.OrderID = r.OrderID
         WHERE o.CustomerID = c.CustomerID
           AND rd.RefundStatus = 'Processed') AS TotalRefunded
  FROM CUSTOMER c;

-- ---------------------------------------------------------------------
-- WarehouseDispositionView: how many units each warehouse restocked,
-- refurbished or disposed (UNION ALL of the disposition tables).
-- ---------------------------------------------------------------------
CREATE VIEW WarehouseDispositionView AS
SELECT w.WarehouseID,
       w.WarehouseName,
       d.Disposition,
       COUNT(*) AS Items
  FROM (
        SELECT WarehouseID, 'Restock'   AS Disposition FROM RESTOCK
        UNION ALL
        SELECT WarehouseID, 'Refurbish' AS Disposition FROM REFURBISH
        UNION ALL
        SELECT WarehouseID, 'Dispose'   AS Disposition FROM DISPOSE
       ) d
  JOIN WAREHOUSE w ON w.WarehouseID = d.WarehouseID
 GROUP BY w.WarehouseID, w.WarehouseName, d.Disposition;
