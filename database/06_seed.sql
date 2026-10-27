-- =====================================================================
-- 06_seed.sql : sample data (DML - INSERT / UPDATE)
--
-- All rows go through the constraints and triggers created earlier, so the
-- seed itself exercises the business rules: order totals are computed by
-- trigger, return statuses advance only through valid transitions, the
-- audit history and inventory are filled automatically.
--
-- Demo logins (passwords are stored as salted scrypt hashes):
--   admin / admin123        (Admin)
--   staff / staff123        (Staff - warehouse & returns desk)
--   rahul / customer123     (Customer 1)
--   priya / customer123     (Customer 2)
--   amit  / customer123     (Customer 3)
-- =====================================================================

USE ReverseLogisticsDB;

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------
INSERT INTO CUSTOMER (CustomerID, Name, Email, Phone, Address, CustomerType) VALUES
    (1, 'Rahul Sharma', 'rahul@example.com',  '9876543210', '12 MG Road, Bengaluru',          'Regular'),
    (2, 'Priya Nair',   'priya@example.com',  '9876543211', '45 Saraswathipuram, Mysuru',     'Premium'),
    (3, 'Amit Kumar',   'amit@example.com',   '9876543212', '8 T. Nagar, Chennai',            'Regular'),
    (4, 'Sneha Reddy',  'sneha@example.com',  '9876543213', '21 Banjara Hills, Hyderabad',    'Premium'),
    (5, 'Vikram Singh', 'vikram@example.com', '9876543214', '3 Connaught Place, New Delhi',   'Regular'),
    (6, 'Ananya Iyer',  'ananya@example.com', '9876543215', '17 Adyar Main Road, Chennai',    'Regular'),
    (7, 'Karthik Rao',  'karthik@example.com','9876543216', '9 Kadri Hills, Mangaluru',       'Premium'),
    (8, 'Meera Joshi',  'meera@example.com',  '9876543217', '30 FC Road, Pune',               'Regular');

INSERT INTO CATEGORY (CategoryID, CategoryName) VALUES
    (1, 'Electronics'),
    (2, 'Clothing'),
    (3, 'Home Appliances'),
    (4, 'Footwear');

INSERT INTO PRODUCT (ProductID, ProductName, SKU, UnitPrice, CategoryID) VALUES
    (1,  'Wireless Headphones', 'ELEC101',  2500.00, 1),
    (2,  'Cotton T-Shirt',      'CLOTH201',  799.00, 2),
    (3,  'Electric Mixer',      'HOME301',  3500.00, 3),
    (4,  'Bluetooth Speaker',   'ELEC102',  1800.00, 1),
    (5,  'Smart Watch',         'ELEC103',  4999.00, 1),
    (6,  'USB-C Power Bank',    'ELEC104',  1299.00, 1),
    (7,  'Denim Jacket',        'CLOTH202', 2199.00, 2),
    (8,  'Formal Shirt',        'CLOTH203', 1199.00, 2),
    (9,  'Air Fryer',           'HOME302',  5499.00, 3),
    (10, 'Steam Iron',          'HOME303',  1599.00, 3),
    (11, 'Running Shoes',       'FOOT401',  3299.00, 4),
    (12, 'Leather Sandals',     'FOOT402',  1499.00, 4);

INSERT INTO RETURN_REASON (ReturnReasonID, ReasonName, Description, IsSellerFault) VALUES
    (1, 'Damaged Product',   'Product arrived damaged',              TRUE),
    (2, 'Wrong Product',     'Incorrect product delivered',          TRUE),
    (3, 'Defective Product', 'Product is not functioning properly',  TRUE),
    (4, 'Other',             'Other return reason',                  FALSE),
    (5, 'Size or Fit Issue', 'Product does not fit as expected',     FALSE),
    (6, 'Changed Mind',      'Customer no longer wants the product', FALSE);

INSERT INTO COURIER (CourierID, CourierName, Phone, Email) VALUES
    (1, 'QuickShip Logistics',   '9000000001', 'support@quickship.example'),
    (2, 'Reliable Couriers',     '9000000002', 'support@reliablecouriers.example'),
    (3, 'SwiftReturn Couriers',  '9000000003', 'help@swiftreturn.example');

INSERT INTO WAREHOUSE (WarehouseID, WarehouseName, Location) VALUES
    (1, 'Bengaluru Central Warehouse',  'Bengaluru'),
    (2, 'Chennai Returns Warehouse',    'Chennai'),
    (3, 'Hyderabad Refurbishment Hub',  'Hyderabad');

INSERT INTO APP_USER (UserID, Username, PasswordHash, Role, CustomerID) VALUES
    (1, 'admin', 'scrypt$f48749ac997beb156c103a5df3c8342e$8d0bb4dab7ba9eb7b1780c0b08397818074eb7df8509bcb94a098218f2d57bdab6e6dcd8723281950233b7eb22ed41c5f675c2f33fbadbfd17038bac51e94283', 'Admin', NULL),
    (2, 'staff', 'scrypt$dafdf834c9c6ed19cd4f5d4f79327f98$d80f7993e65181826dd4ed025bcc3171552ed32e6ed25b089d940bbcd89d88dc8d6a24650e15d36ef229ad875341c585c608b06d7b06e0d65cb7cc4bc266c7af', 'Staff', NULL),
    (3, 'rahul', 'scrypt$ef90df695baed59561d79adf91fc2b07$aab1d9933e45a34a7bb4fcaeddc0bfda2187ae86387b9418b17c165e6dd83de959a43830f286bf7f066ef65fa0d590d390be4d604b74f26bf4da33ed8fb05d43', 'Customer', 1),
    (4, 'priya', 'scrypt$ef90df695baed59561d79adf91fc2b07$aab1d9933e45a34a7bb4fcaeddc0bfda2187ae86387b9418b17c165e6dd83de959a43830f286bf7f066ef65fa0d590d390be4d604b74f26bf4da33ed8fb05d43', 'Customer', 2),
    (5, 'amit',  'scrypt$ef90df695baed59561d79adf91fc2b07$aab1d9933e45a34a7bb4fcaeddc0bfda2187ae86387b9418b17c165e6dd83de959a43830f286bf7f066ef65fa0d590d390be4d604b74f26bf4da33ed8fb05d43', 'Customer', 3);

-- ---------------------------------------------------------------------
-- Orders. TotalAmount starts at 0 and is filled in by the ORDER_ITEM
-- triggers.
-- ---------------------------------------------------------------------
INSERT INTO ORDERS (OrderID, OrderDate, PaymentMethod, OrderStatus, CustomerID) VALUES
    (1,  '2026-10-10', 'UPI',        'Delivered', 1),
    (2,  '2026-10-11', 'Card',       'Delivered', 2),
    (3,  '2026-10-12', 'UPI',        'Delivered', 3),
    (4,  '2026-08-05', 'Card',       'Delivered', 4),
    (5,  '2026-08-18', 'UPI',        'Delivered', 5),
    (6,  '2026-09-02', 'Cash',       'Delivered', 6),
    (7,  '2026-09-10', 'NetBanking', 'Delivered', 7),
    (8,  '2026-09-15', 'UPI',        'Delivered', 1),
    (9,  '2026-09-22', 'Card',       'Delivered', 8),
    (10, '2026-09-28', 'UPI',        'Delivered', 2),
    (11, '2026-10-01', 'Card',       'Delivered', 4),
    (12, '2026-10-03', 'UPI',        'Delivered', 5),
    (13, '2026-10-05', 'Cash',       'Delivered', 6),
    (14, '2026-10-08', 'UPI',        'Delivered', 7),
    (15, '2026-10-14', 'Card',       'Delivered', 3),
    (16, '2026-10-18', 'UPI',        'Delivered', 8),
    (17, '2026-10-20', 'Card',       'Shipped',   1),
    (18, '2026-10-23', 'UPI',        'Placed',    2),
    (19, '2026-10-24', 'Cash',       'Cancelled', 5),
    (20, '2026-10-15', 'UPI',        'Delivered', 1);

INSERT INTO ORDER_ITEM (OrderItemID, OrderID, ProductID, Quantity, UnitPrice) VALUES
    (1,  1,  1,  1, 2500.00),
    (2,  2,  2,  2,  799.00),
    (3,  3,  3,  1, 3500.00),
    (4,  4,  5,  1, 4999.00),
    (5,  4,  6,  1, 1299.00),
    (6,  5,  11, 1, 3299.00),
    (7,  5,  2,  3,  799.00),
    (8,  6,  9,  1, 5499.00),
    (9,  7,  7,  1, 2199.00),
    (10, 7,  8,  2, 1199.00),
    (11, 8,  4,  2, 1800.00),
    (12, 9,  10, 1, 1599.00),
    (13, 9,  12, 1, 1499.00),
    (14, 10, 5,  1, 4999.00),
    (15, 11, 11, 1, 3299.00),
    (16, 12, 1,  1, 2500.00),
    (17, 12, 6,  2, 1299.00),
    (18, 13, 8,  1, 1199.00),
    (19, 14, 3,  1, 3500.00),
    (20, 15, 12, 2, 1499.00),
    (21, 16, 4,  1, 1800.00),
    (22, 16, 2,  1,  799.00),
    (23, 17, 9,  1, 5499.00),
    (24, 18, 7,  1, 2199.00),
    (25, 19, 10, 1, 1599.00),
    (26, 20, 5,  1, 4999.00);

-- Recent delivered orders dated relative to today, so the demo customers
-- always have items inside the 30-day return window whenever the database
-- is (re)built.
INSERT INTO ORDERS (OrderID, OrderDate, PaymentMethod, OrderStatus, CustomerID) VALUES
    (21, DATE_SUB(CURRENT_DATE, INTERVAL 3 DAY), 'UPI',  'Delivered', 1),
    (22, DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY), 'Card', 'Delivered', 2),
    (23, DATE_SUB(CURRENT_DATE, INTERVAL 4 DAY), 'UPI',  'Delivered', 3);

INSERT INTO ORDER_ITEM (OrderItemID, OrderID, ProductID, Quantity, UnitPrice) VALUES
    (27, 21, 4,  2, 1800.00),
    (28, 21, 2,  1,  799.00),
    (29, 22, 11, 1, 3299.00),
    (30, 23, 6,  1, 1299.00);

-- ---------------------------------------------------------------------
-- Returns (OrderID is derived by trg_returns_before_insert)
-- ---------------------------------------------------------------------
SET @app_user_id = NULL;

INSERT INTO RETURNS (ReturnID, OrderItemID, ReturnDate, ReturnQty, ReturnReasonID, Comments) VALUES
    (1,  4,  '2026-08-12', 1, 3, 'Watch stops charging after two days of use.'),
    (2,  6,  '2026-08-25', 1, 5, 'Shoes are half a size too small.'),
    (3,  7,  '2026-08-26', 2, 6, 'Ordered extra by mistake, tags still attached.'),
    (4,  8,  '2026-09-08', 1, 1, 'Air fryer basket arrived cracked and the box was crushed.'),
    (5,  9,  '2026-09-20', 1, 6, 'Did not like the colour of the jacket.'),
    (6,  11, '2026-09-25', 1, 3, 'Speaker crackles at high volume and the battery drains fast.'),
    (7,  12, '2026-10-02', 1, 2, 'Received a different model of steam iron than ordered.'),
    (8,  14, '2026-10-06', 1, 6, 'Found a better deal elsewhere, box is unopened.'),
    (9,  15, '2026-10-09', 1, 5, 'Shoes are too narrow for my feet.'),
    (10, 18, '2026-10-12', 1, 6, 'Changed my mind about the shirt.'),
    (11, 1,  '2026-10-15', 1, 3, 'Left earcup has no sound and Bluetooth disconnects frequently.'),
    (12, 19, '2026-10-20', 1, 1, 'Mixer jar is chipped and the lid does not lock.'),
    (13, 20, '2026-10-22', 1, 5, 'One pair of sandals is too large.'),
    (14, 26, '2026-10-21', 1, 2, 'Received a black strap watch instead of the silver one.');

-- Staff decisions (each change is validated by the state machine trigger
-- and recorded in RETURN_STATUS_HISTORY).
SET @app_user_id = 2;

UPDATE RETURNS SET ReturnStatus = 'Approved' WHERE ReturnID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 14);
UPDATE RETURNS SET ReturnStatus = 'Rejected' WHERE ReturnID = 10;

-- Pickups (the PICKUP triggers move each return to 'Pickup Scheduled').
-- Note: plain VALUES are used because a statement may not read RETURNS
-- while its own trigger updates RETURNS (MySQL error 1442).
INSERT INTO PICKUP (PickupID, ReturnID, PickupDate, PickupAddress, CourierID) VALUES
    (1, 1,  '2026-08-14', '21 Banjara Hills, Hyderabad',  1),
    (2, 2,  '2026-08-27', '3 Connaught Place, New Delhi', 2),
    (3, 3,  '2026-08-28', '3 Connaught Place, New Delhi', 2),
    (4, 4,  '2026-09-10', '17 Adyar Main Road, Chennai',  1),
    (5, 5,  '2026-09-22', '9 Kadri Hills, Mangaluru',     3),
    (6, 6,  '2026-09-27', '12 MG Road, Bengaluru',        1),
    (7, 7,  '2026-10-04', '30 FC Road, Pune',             2),
    (8, 8,  '2026-10-28', '45 Saraswathipuram, Mysuru',   3),
    (9, 14, '2026-10-23', '12 MG Road, Bengaluru',        1);

UPDATE PICKUP SET PickupStatus = 'Picked Up' WHERE PickupID IN (1, 2, 3, 4, 5, 6, 7);
UPDATE PICKUP SET PickupStatus = 'Failed'    WHERE PickupID = 9;

-- Inspections (detailed reports for these are seeded into MongoDB by
-- scripts/mongo-setup.mjs)
INSERT INTO INSPECTION (InspectionID, InspectionDate, ProductCondition, Remarks, ReturnID, InspectorID) VALUES
    (1, '2026-08-17', 'Defective', 'Charging circuit faulty; display and strap are fine.',                    1, 2),
    (2, '2026-08-29', 'Like New',  'Unworn, original box and tags intact.',                                   2, 2),
    (3, '2026-08-30', 'Good',      'Two shirts unworn with tags attached, slight fold creases.',              3, 2),
    (4, '2026-09-12', 'Damaged',   'Basket cracked and heating element housing dented in transit.',          4, 2),
    (5, '2026-09-24', 'Damaged',   'Stains on the sleeve and visible signs of wear.',                         5, 2),
    (6, '2026-09-29', 'Defective', 'Speaker driver distorts above 70 percent volume; battery holds 40 percent.', 6, 2);

-- Dispositions (exactly one per inspection)
INSERT INTO REFURBISH (InspectionID, RefurbishDate, Details, WarehouseID) VALUES
    (1, '2026-08-18', 'Replace charging module and battery.', 3),
    (6, '2026-09-30', 'Replace speaker driver and battery pack.', 3);

INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID) VALUES
    (2, '2026-08-29', 1, 1),
    (3, '2026-08-30', 2, 1);

INSERT INTO DISPOSE (InspectionID, DisposeDate, Reason, DisposalMethod, WarehouseID) VALUES
    (4, '2026-09-12', 'Transit damage beyond economical repair.', 'Recycle', 2);

INSERT INTO REJECT (InspectionID, RejectDate, Reason) VALUES
    (5, '2026-09-24', 'Item shows signs of use and stains; violates the return policy.');

-- Refunds: the amount always comes from the refund policy function.
-- (Computed into variables first, again because of MySQL error 1442.)
SET @refund_1 = fn_calculate_refund(1);
SET @refund_2 = fn_calculate_refund(2);
SET @refund_3 = fn_calculate_refund(3);
SET @refund_4 = fn_calculate_refund(4);

INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod, RefundStatus) VALUES
    (1, '2026-08-19', @refund_1, 'Original Payment', 'Processed'),
    (2, '2026-08-31', @refund_2, 'UPI',              'Processed'),
    (3, '2026-09-01', @refund_3, 'Store Credit',     'Processed'),
    (4, '2026-09-13', @refund_4, 'Original Payment', 'Processed');

SET @app_user_id = NULL;

-- The audit rows above were stamped with the time this script ran. Backdate
-- them to match the business dates of the sample data so the history reads
-- like a real timeline. (Only sample data does this; the application never
-- edits the audit trail.)
UPDATE RETURN_STATUS_HISTORY h
  JOIN RETURNS r         ON r.ReturnID = h.ReturnID
  LEFT JOIN PICKUP p     ON p.ReturnID = r.ReturnID
  LEFT JOIN INSPECTION i ON i.ReturnID = r.ReturnID
  LEFT JOIN REFUND rd    ON rd.PickupID = p.PickupID
   SET h.ChangedAt = CASE
         WHEN h.NewStatus = 'Requested' THEN TIMESTAMP(r.ReturnDate, '09:15:00')
         WHEN h.NewStatus = 'Approved' AND h.OldStatus = 'Pickup Scheduled'
              THEN TIMESTAMP(p.PickupDate, '16:45:00')
         WHEN h.NewStatus IN ('Approved', 'Rejected')
              THEN TIMESTAMP(DATE_ADD(r.ReturnDate, INTERVAL 1 DAY), '11:00:00')
         WHEN h.NewStatus = 'Pickup Scheduled'
              THEN TIMESTAMP(DATE_ADD(r.ReturnDate, INTERVAL 1 DAY), '11:05:00')
         WHEN h.NewStatus = 'Picked Up' THEN TIMESTAMP(p.PickupDate, '14:20:00')
         WHEN h.NewStatus = 'Inspected' THEN TIMESTAMP(i.InspectionDate, '15:30:00')
         WHEN h.NewStatus = 'Closed'    THEN TIMESTAMP(i.InspectionDate, '15:35:00')
         WHEN h.NewStatus = 'Refunded'  THEN TIMESTAMP(rd.RefundDate, '12:00:00')
         ELSE h.ChangedAt
       END;

-- Quick verification
SELECT 'customers' AS item, COUNT(*) AS total FROM CUSTOMER
UNION ALL SELECT 'products', COUNT(*) FROM PRODUCT
UNION ALL SELECT 'orders',   COUNT(*) FROM ORDERS
UNION ALL SELECT 'returns',  COUNT(*) FROM RETURNS
UNION ALL SELECT 'history',  COUNT(*) FROM RETURN_STATUS_HISTORY
UNION ALL SELECT 'refunds',  COUNT(*) FROM REFUND;
