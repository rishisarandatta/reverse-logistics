-- =====================================================================
-- 07_queries.sql : important queries for the demonstration
--
-- Not part of db:setup. Run statements one at a time in MySQL Workbench
-- to demonstrate DML, joins, aggregation, subqueries, views, procedures,
-- transactions, full-text search and the integrity rules.
-- =====================================================================

USE ReverseLogisticsDB;

-- ---------------------------------------------------------------------
-- A. Basic DML (INSERT / UPDATE / DELETE / SELECT)
-- ---------------------------------------------------------------------

-- A1. Insert a customer (CHECK constraints validate email / phone / type)
INSERT INTO CUSTOMER (Name, Email, Phone, Address, CustomerType)
VALUES ('Demo Customer', 'demo@example.com', '9000012345', 'Demo Street, Bengaluru', 'Regular');

-- A2. Update it
UPDATE CUSTOMER SET CustomerType = 'Premium' WHERE Email = 'demo@example.com';

-- A3. Read it back
SELECT * FROM CUSTOMER WHERE Email = 'demo@example.com';

-- A4. Delete it (works because it has no orders)
DELETE FROM CUSTOMER WHERE Email = 'demo@example.com';

-- ---------------------------------------------------------------------
-- B. Joins
-- ---------------------------------------------------------------------

-- B1. INNER JOIN across five tables: every returned item with customer,
--     product, category and reason
SELECT r.ReturnID, c.Name AS Customer, p.ProductName, cat.CategoryName,
       rr.ReasonName, r.ReturnStatus
  FROM RETURNS r
  JOIN ORDER_ITEM oi    ON oi.OrderItemID = r.OrderItemID
  JOIN ORDERS o         ON o.OrderID = r.OrderID
  JOIN CUSTOMER c       ON c.CustomerID = o.CustomerID
  JOIN PRODUCT p        ON p.ProductID = oi.ProductID
  JOIN CATEGORY cat     ON cat.CategoryID = p.CategoryID
  JOIN RETURN_REASON rr ON rr.ReturnReasonID = r.ReturnReasonID
 ORDER BY r.ReturnID;

-- B2. LEFT JOIN: every customer, including those who never returned anything
SELECT c.Name, COUNT(r.ReturnID) AS Returns
  FROM CUSTOMER c
  LEFT JOIN ORDERS o  ON o.CustomerID = c.CustomerID
  LEFT JOIN RETURNS r ON r.OrderID = o.OrderID
 GROUP BY c.CustomerID, c.Name
 ORDER BY Returns DESC, c.Name;

-- ---------------------------------------------------------------------
-- C. Aggregation: GROUP BY, HAVING, ORDER BY
-- ---------------------------------------------------------------------

-- C1. Return rate per category (only categories that sold something)
SELECT cat.CategoryName,
       SUM(oi.Quantity) AS UnitsSold,
       COALESCE(SUM(rq.Returned), 0) AS UnitsReturned,
       ROUND(100 * COALESCE(SUM(rq.Returned), 0) / SUM(oi.Quantity), 1) AS ReturnRatePct
  FROM CATEGORY cat
  JOIN PRODUCT p     ON p.CategoryID = cat.CategoryID
  JOIN ORDER_ITEM oi ON oi.ProductID = p.ProductID
  JOIN ORDERS o      ON o.OrderID = oi.OrderID AND o.OrderStatus <> 'Cancelled'
  LEFT JOIN (SELECT OrderItemID, SUM(ReturnQty) AS Returned
               FROM RETURNS WHERE ReturnStatus <> 'Rejected'
              GROUP BY OrderItemID) rq ON rq.OrderItemID = oi.OrderItemID
 GROUP BY cat.CategoryID, cat.CategoryName
HAVING SUM(oi.Quantity) > 0
 ORDER BY ReturnRatePct DESC;

-- C2. Customers with two or more returns
SELECT c.Name, COUNT(*) AS Returns, SUM(r.ReturnQty * oi.UnitPrice) AS ValueReturned
  FROM RETURNS r
  JOIN ORDERS o      ON o.OrderID = r.OrderID
  JOIN CUSTOMER c    ON c.CustomerID = o.CustomerID
  JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
 GROUP BY c.CustomerID, c.Name
HAVING COUNT(*) >= 2;

-- C3. Refund totals per refund method
SELECT RefundMethod, COUNT(*) AS Refunds, SUM(RefundAmount) AS Total, AVG(RefundAmount) AS Average
  FROM REFUND
 WHERE RefundStatus = 'Processed'
 GROUP BY RefundMethod
 ORDER BY Total DESC;

-- ---------------------------------------------------------------------
-- D. Subqueries
-- ---------------------------------------------------------------------

-- D1. Products whose return rate is above the average (subquery on a view)
SELECT ProductName, ReturnRatePct
  FROM ProductReturnStatsView
 WHERE ReturnRatePct > (SELECT AVG(ReturnRatePct) FROM ProductReturnStatsView WHERE UnitsSold > 0);

-- D2. Correlated subquery: each customer's most expensive order
SELECT o.CustomerID, o.OrderID, o.TotalAmount
  FROM ORDERS o
 WHERE o.TotalAmount = (SELECT MAX(o2.TotalAmount) FROM ORDERS o2 WHERE o2.CustomerID = o.CustomerID);

-- D3. NOT EXISTS: products that have never been returned
SELECT p.ProductName
  FROM PRODUCT p
 WHERE NOT EXISTS (SELECT 1
                     FROM RETURNS r
                     JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
                    WHERE oi.ProductID = p.ProductID);

-- D4. IN with subquery: customers who were refunded at least once
SELECT Name FROM CUSTOMER
 WHERE CustomerID IN (SELECT CustomerID FROM ReturnPipelineView WHERE RefundStatus = 'Processed');

-- ---------------------------------------------------------------------
-- E. Views
-- ---------------------------------------------------------------------
SELECT * FROM OrderDetailsView WHERE CustomerID = 1;
SELECT ReturnID, ReturnStatus, PickupStatus, ProductCondition, Disposition, RefundAmount FROM ReturnPipelineView;
SELECT * FROM PendingActionsView;
SELECT * FROM ProductReturnStatsView ORDER BY ReturnRatePct DESC;
SELECT * FROM CustomerReturnSummaryView;
SELECT * FROM WarehouseDispositionView;

-- ---------------------------------------------------------------------
-- F. Stored functions and procedures
-- ---------------------------------------------------------------------
SELECT ReturnID, ReasonName, ProductCondition, ReturnValue, fn_calculate_refund(ReturnID) AS RefundDue
  FROM ReturnPipelineView
 WHERE InspectionID IS NOT NULL;

SELECT fn_is_valid_return_transition('Requested', 'Approved')  AS allowed,
       fn_is_valid_return_transition('Requested', 'Refunded')  AS skipped_steps;

CALL GetCustomerOrders(1);

-- ---------------------------------------------------------------------
-- G. Transactions
-- ---------------------------------------------------------------------

-- G1. Manual transaction with ROLLBACK: nothing is saved
START TRANSACTION;
UPDATE RETURNS SET ReturnStatus = 'Approved' WHERE ReturnID = 12;
SELECT ReturnID, ReturnStatus FROM RETURNS WHERE ReturnID = 12;   -- Approved (inside the transaction)
ROLLBACK;
SELECT ReturnID, ReturnStatus FROM RETURNS WHERE ReturnID = 12;   -- back to Requested

-- G2. Procedure with its own transaction and EXIT HANDLER: the error is
--     raised and the partial work is rolled back (pickup 7 is not inspected)
CALL sp_process_refund(7, 'UPI', 2, @refund_id, @amount);

-- ---------------------------------------------------------------------
-- H. Full-text search (FULLTEXT indexes)
-- ---------------------------------------------------------------------
SELECT ReturnID, Comments, MATCH(Comments) AGAINST ('battery* charg*' IN BOOLEAN MODE) AS Score
  FROM RETURNS
 WHERE MATCH(Comments) AGAINST ('battery* charg*' IN BOOLEAN MODE)
 ORDER BY Score DESC;

SELECT InspectionID, Remarks
  FROM INSPECTION
 WHERE MATCH(Remarks) AGAINST ('cracked dented' IN NATURAL LANGUAGE MODE);

-- ---------------------------------------------------------------------
-- I. Indexes in action
-- ---------------------------------------------------------------------
SHOW INDEX FROM RETURNS;
EXPLAIN SELECT * FROM RETURNS WHERE ReturnStatus = 'Requested';
EXPLAIN SELECT * FROM ORDERS WHERE CustomerID = 1 ORDER BY OrderDate;

-- ---------------------------------------------------------------------
-- J. Integrity rules rejecting bad data (each statement FAILS on purpose)
-- ---------------------------------------------------------------------
INSERT INTO CUSTOMER (Name, Email) VALUES ('Bad', 'not-an-email');                      -- CHECK
INSERT INTO PRODUCT (ProductName, SKU, UnitPrice, CategoryID) VALUES ('X', 'Y', -1, 1);  -- CHECK
DELETE FROM CUSTOMER WHERE CustomerID = 1;                                                -- FK RESTRICT
INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID) VALUES (4, 1, 1);            -- 30-day window
UPDATE RETURNS SET ReturnStatus = 'Refunded' WHERE ReturnID = 11;                         -- state machine
INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID)
VALUES (1, CURDATE(), 1, 1);                                                              -- one disposition
UPDATE REFUND SET RefundAmount = 1 WHERE RefundID = 1;                                    -- immutable refund

-- ---------------------------------------------------------------------
-- K. DDL: ALTER and DROP on a scratch table
-- ---------------------------------------------------------------------
CREATE TABLE DEMO_NOTE (NoteID INT AUTO_INCREMENT PRIMARY KEY, Body VARCHAR(100));
ALTER TABLE DEMO_NOTE ADD COLUMN CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE DEMO_NOTE MODIFY Body VARCHAR(255) NOT NULL;
ALTER TABLE DEMO_NOTE ADD CONSTRAINT chk_demo_body CHECK (CHAR_LENGTH(Body) > 0);
CREATE INDEX idx_demo_created ON DEMO_NOTE (CreatedAt);
DROP INDEX idx_demo_created ON DEMO_NOTE;
DROP TABLE DEMO_NOTE;
