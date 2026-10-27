-- =====================================================================
-- 02_constraints_indexes.sql : domain constraints and indexes (DDL - ALTER)
--
-- Row-level validation is pushed into the database with CHECK constraints
-- (enforced by MySQL 8.0.16+), so invalid data is rejected no matter which
-- client writes it. Indexes support the application's most frequent
-- filters, joins and the full-text search feature.
-- =====================================================================

USE ReverseLogisticsDB;

-- ---------------------------------------------------------------------
-- CHECK constraints (data validation at the database level)
-- ---------------------------------------------------------------------
ALTER TABLE CUSTOMER
    ADD CONSTRAINT chk_customer_email
        CHECK (Email REGEXP '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'),
    ADD CONSTRAINT chk_customer_phone
        CHECK (Phone IS NULL OR Phone REGEXP '^[6-9][0-9]{9}$'),
    ADD CONSTRAINT chk_customer_type
        CHECK (CustomerType IN ('Regular', 'Premium'));

ALTER TABLE PRODUCT
    ADD CONSTRAINT uq_product_sku UNIQUE (SKU),
    ADD CONSTRAINT chk_product_price CHECK (UnitPrice >= 0);

ALTER TABLE ORDERS
    ADD CONSTRAINT chk_order_total CHECK (TotalAmount >= 0),
    ADD CONSTRAINT chk_order_payment
        CHECK (PaymentMethod IN ('Cash', 'UPI', 'Card', 'NetBanking')),
    ADD CONSTRAINT chk_order_status
        CHECK (OrderStatus IN ('Placed', 'Shipped', 'Delivered', 'Cancelled'));

ALTER TABLE ORDER_ITEM
    ADD CONSTRAINT chk_orderitem_quantity CHECK (Quantity > 0),
    ADD CONSTRAINT chk_orderitem_price CHECK (UnitPrice >= 0);

ALTER TABLE RETURNS
    ADD CONSTRAINT chk_return_qty CHECK (ReturnQty > 0),
    ADD CONSTRAINT chk_return_status
        CHECK (ReturnStatus IN ('Requested', 'Approved', 'Rejected',
                                'Pickup Scheduled', 'Picked Up',
                                'Inspected', 'Refunded', 'Closed'));

ALTER TABLE PICKUP
    ADD CONSTRAINT chk_pickup_status
        CHECK (PickupStatus IN ('Scheduled', 'Picked Up', 'Failed', 'Cancelled'));

ALTER TABLE APP_USER
    ADD CONSTRAINT chk_app_user_role
        CHECK (Role IN ('Admin', 'Staff', 'Customer')),
    -- Customer accounts must point at a CUSTOMER row; staff/admin must not.
    ADD CONSTRAINT chk_app_user_customer_link
        CHECK ((Role = 'Customer' AND CustomerID IS NOT NULL)
            OR (Role <> 'Customer' AND CustomerID IS NULL)),
    ADD CONSTRAINT chk_app_user_username
        CHECK (CHAR_LENGTH(Username) >= 3);

ALTER TABLE INSPECTION
    ADD CONSTRAINT chk_inspection_condition
        CHECK (ProductCondition IN ('Like New', 'Good', 'Fair',
                                    'Damaged', 'Defective'));

ALTER TABLE REFUND
    ADD CONSTRAINT chk_refund_amount CHECK (RefundAmount >= 0),
    ADD CONSTRAINT chk_refund_method
        CHECK (RefundMethod IN ('Original Payment', 'UPI',
                                'Bank Transfer', 'Store Credit')),
    ADD CONSTRAINT chk_refund_status
        CHECK (RefundStatus IN ('Pending', 'Processed', 'Failed'));

ALTER TABLE RESTOCK
    ADD CONSTRAINT chk_restock_qty CHECK (NewStockQty > 0);

ALTER TABLE DISPOSE
    ADD CONSTRAINT chk_dispose_method
        CHECK (DisposalMethod IN ('Recycle', 'E-Waste', 'Landfill', 'Donate'));

ALTER TABLE INVENTORY
    ADD CONSTRAINT chk_inventory_qty CHECK (Quantity >= 0);

-- ---------------------------------------------------------------------
-- Secondary indexes
-- (InnoDB already indexes every PK, UNIQUE and FK column automatically.)
-- ---------------------------------------------------------------------

-- "Orders of a customer, newest first" (customer order history page).
CREATE INDEX idx_orders_customer_date ON ORDERS (CustomerID, OrderDate);

-- Dashboard counts and filters by status.
CREATE INDEX idx_orders_status  ON ORDERS (OrderStatus);
CREATE INDEX idx_returns_status ON RETURNS (ReturnStatus);
CREATE INDEX idx_pickup_status  ON PICKUP (PickupStatus);

-- Time-based reporting (returns per month, refunds per month).
CREATE INDEX idx_returns_date        ON RETURNS (ReturnDate);
CREATE INDEX idx_refund_status_date  ON REFUND (RefundStatus, RefundDate);

-- Audit trail lookups for one return in chronological order.
CREATE INDEX idx_history_return_time ON RETURN_STATUS_HISTORY (ReturnID, ChangedAt);

-- ---------------------------------------------------------------------
-- FULLTEXT indexes (natural-language search over free text)
-- ---------------------------------------------------------------------
CREATE FULLTEXT INDEX ft_returns_comments   ON RETURNS (Comments);
CREATE FULLTEXT INDEX ft_inspection_remarks ON INSPECTION (Remarks);
CREATE FULLTEXT INDEX ft_product_name       ON PRODUCT (ProductName);
