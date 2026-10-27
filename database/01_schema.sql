-- =====================================================================
-- Reverse Logistics Management System
-- 01_schema.sql : database and table definitions (DDL - CREATE)
--
-- Run order: 01_schema -> 02_constraints_indexes -> 03_functions_procedures
--            -> 04_triggers -> 05_views -> 06_seed
-- (or simply: npm run db:setup)
--
-- Design notes
--   * Every table uses a surrogate INT primary key with AUTO_INCREMENT so the
--     application never has to compute MAX(id) + 1 (which is race-prone).
--   * Foreign keys use ON DELETE RESTRICT (the default) so business history
--     can never be orphaned. ORDER_ITEM is the only CASCADE: items have no
--     meaning without their order.
--   * Row-level domain rules (status values, non-negative amounts, formats)
--     are added with ALTER TABLE in 02_constraints_indexes.sql.
--   * Cross-table business rules (return window, workflow state machine,
--     single disposition per inspection, refund limits) are enforced by the
--     triggers in 04_triggers.sql.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ReverseLogisticsDB
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE ReverseLogisticsDB;

-- ---------------------------------------------------------------------
-- 1. CUSTOMER
-- ---------------------------------------------------------------------
CREATE TABLE CUSTOMER (
    CustomerID   INT          NOT NULL AUTO_INCREMENT,
    Name         VARCHAR(100) NOT NULL,
    Email        VARCHAR(100) NOT NULL,
    Phone        VARCHAR(20),
    Address      VARCHAR(255),
    CustomerType VARCHAR(30)  NOT NULL DEFAULT 'Regular',
    CONSTRAINT pk_customer PRIMARY KEY (CustomerID),
    CONSTRAINT uq_customer_email UNIQUE (Email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. CATEGORY
-- ---------------------------------------------------------------------
CREATE TABLE CATEGORY (
    CategoryID   INT          NOT NULL AUTO_INCREMENT,
    CategoryName VARCHAR(100) NOT NULL,
    CONSTRAINT pk_category PRIMARY KEY (CategoryID),
    CONSTRAINT uq_category_name UNIQUE (CategoryName)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. PRODUCT
-- ---------------------------------------------------------------------
CREATE TABLE PRODUCT (
    ProductID   INT           NOT NULL AUTO_INCREMENT,
    ProductName VARCHAR(150)  NOT NULL,
    SKU         VARCHAR(50)   NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL,
    CategoryID  INT           NOT NULL,
    CONSTRAINT pk_product PRIMARY KEY (ProductID),
    CONSTRAINT fk_product_category
        FOREIGN KEY (CategoryID) REFERENCES CATEGORY(CategoryID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. ORDERS
-- ---------------------------------------------------------------------
CREATE TABLE ORDERS (
    OrderID       INT           NOT NULL AUTO_INCREMENT,
    OrderDate     DATE          NOT NULL,
    TotalAmount   DECIMAL(10,2) NOT NULL DEFAULT 0,
    PaymentMethod VARCHAR(50)   NOT NULL,
    OrderStatus   VARCHAR(50)   NOT NULL DEFAULT 'Placed',
    CustomerID    INT           NOT NULL,
    CONSTRAINT pk_orders PRIMARY KEY (OrderID),
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (CustomerID) REFERENCES CUSTOMER(CustomerID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. ORDER_ITEM
--    UNIQUE (OrderItemID, OrderID) exists only so RETURNS can reference the
--    pair with a composite foreign key (see RETURNS below).
-- ---------------------------------------------------------------------
CREATE TABLE ORDER_ITEM (
    OrderItemID INT           NOT NULL AUTO_INCREMENT,
    Quantity    INT           NOT NULL,
    UnitPrice   DECIMAL(10,2) NOT NULL,
    OrderID     INT           NOT NULL,
    ProductID   INT           NOT NULL,
    CONSTRAINT pk_order_item PRIMARY KEY (OrderItemID),
    CONSTRAINT uq_orderitem_order UNIQUE (OrderItemID, OrderID),
    CONSTRAINT fk_orderitem_order
        FOREIGN KEY (OrderID) REFERENCES ORDERS(OrderID)
        ON DELETE CASCADE,
    CONSTRAINT fk_orderitem_product
        FOREIGN KEY (ProductID) REFERENCES PRODUCT(ProductID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. RETURN_REASON
-- ---------------------------------------------------------------------
CREATE TABLE RETURN_REASON (
    ReturnReasonID INT          NOT NULL AUTO_INCREMENT,
    ReasonName     VARCHAR(100) NOT NULL,
    Description    VARCHAR(255),
    IsSellerFault  BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_return_reason PRIMARY KEY (ReturnReasonID),
    CONSTRAINT uq_return_reason_name UNIQUE (ReasonName)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7. RETURNS
--    OrderID is kept from the ER design for convenient querying, but the
--    composite foreign key (OrderItemID, OrderID) guarantees it always
--    matches the order that actually contains the item. A BEFORE INSERT
--    trigger fills it in automatically.
-- ---------------------------------------------------------------------
CREATE TABLE RETURNS (
    ReturnID       INT          NOT NULL AUTO_INCREMENT,
    OrderItemID    INT          NOT NULL,
    ReturnDate     DATE         NOT NULL DEFAULT (CURRENT_DATE),
    ReturnQty      INT          NOT NULL DEFAULT 1,
    ReturnReasonID INT          NOT NULL,
    ReturnStatus   VARCHAR(50)  NOT NULL DEFAULT 'Requested',
    Comments       VARCHAR(500),
    OrderID        INT          NOT NULL,
    CONSTRAINT pk_returns PRIMARY KEY (ReturnID),
    CONSTRAINT fk_returns_order
        FOREIGN KEY (OrderID) REFERENCES ORDERS(OrderID),
    CONSTRAINT fk_returns_order_item
        FOREIGN KEY (OrderItemID, OrderID)
        REFERENCES ORDER_ITEM(OrderItemID, OrderID),
    CONSTRAINT fk_returns_reason
        FOREIGN KEY (ReturnReasonID) REFERENCES RETURN_REASON(ReturnReasonID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. COURIER
-- ---------------------------------------------------------------------
CREATE TABLE COURIER (
    CourierID   INT          NOT NULL AUTO_INCREMENT,
    CourierName VARCHAR(100) NOT NULL,
    Phone       VARCHAR(20),
    Email       VARCHAR(100),
    CONSTRAINT pk_courier PRIMARY KEY (CourierID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 9. PICKUP  (1 : 1 with RETURNS)
-- ---------------------------------------------------------------------
CREATE TABLE PICKUP (
    PickupID      INT          NOT NULL AUTO_INCREMENT,
    ReturnID      INT          NOT NULL,
    PickupDate    DATE         NOT NULL,
    PickupAddress VARCHAR(255) NOT NULL,
    PickupStatus  VARCHAR(50)  NOT NULL DEFAULT 'Scheduled',
    CourierID     INT          NOT NULL,
    CONSTRAINT pk_pickup PRIMARY KEY (PickupID),
    CONSTRAINT uq_pickup_return UNIQUE (ReturnID),
    CONSTRAINT fk_pickup_return
        FOREIGN KEY (ReturnID) REFERENCES RETURNS(ReturnID),
    CONSTRAINT fk_pickup_courier
        FOREIGN KEY (CourierID) REFERENCES COURIER(CourierID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. APP_USER  (application login accounts; Admin / Staff / Customer)
--     A Customer account must be linked to exactly one CUSTOMER row;
--     Admin and Staff accounts must not be (CHECK added in 02).
-- ---------------------------------------------------------------------
CREATE TABLE APP_USER (
    UserID       INT          NOT NULL AUTO_INCREMENT,
    Username     VARCHAR(50)  NOT NULL,
    PasswordHash VARCHAR(255) NOT NULL,
    Role         VARCHAR(20)  NOT NULL,
    CustomerID   INT          NULL,
    IsActive     BOOLEAN      NOT NULL DEFAULT TRUE,
    CreatedAt    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_app_user PRIMARY KEY (UserID),
    CONSTRAINT uq_app_user_username UNIQUE (Username),
    CONSTRAINT uq_app_user_customer UNIQUE (CustomerID),
    CONSTRAINT fk_app_user_customer
        FOREIGN KEY (CustomerID) REFERENCES CUSTOMER(CustomerID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. INSPECTION  (1 : 1 with RETURNS)
--     Structured summary only. The detailed, category-specific inspection
--     report (checklists, defects, photos) lives in MongoDB, keyed by
--     InspectionID.
-- ---------------------------------------------------------------------
CREATE TABLE INSPECTION (
    InspectionID     INT          NOT NULL AUTO_INCREMENT,
    InspectionDate   DATE         NOT NULL,
    ProductCondition VARCHAR(100) NOT NULL,
    Remarks          VARCHAR(500),
    ReturnID         INT          NOT NULL,
    InspectorID      INT          NULL,
    CONSTRAINT pk_inspection PRIMARY KEY (InspectionID),
    CONSTRAINT uq_inspection_return UNIQUE (ReturnID),
    CONSTRAINT fk_inspection_return
        FOREIGN KEY (ReturnID) REFERENCES RETURNS(ReturnID),
    CONSTRAINT fk_inspection_inspector
        FOREIGN KEY (InspectorID) REFERENCES APP_USER(UserID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 12. REFUND  (1 : 1 with PICKUP)
-- ---------------------------------------------------------------------
CREATE TABLE REFUND (
    RefundID     INT           NOT NULL AUTO_INCREMENT,
    PickupID     INT           NOT NULL,
    RefundDate   DATE          NOT NULL,
    RefundAmount DECIMAL(10,2) NOT NULL,
    RefundMethod VARCHAR(50)   NOT NULL,
    RefundStatus VARCHAR(50)   NOT NULL DEFAULT 'Pending',
    CONSTRAINT pk_refund PRIMARY KEY (RefundID),
    CONSTRAINT uq_refund_pickup UNIQUE (PickupID),
    CONSTRAINT fk_refund_pickup
        FOREIGN KEY (PickupID) REFERENCES PICKUP(PickupID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 13. WAREHOUSE
-- ---------------------------------------------------------------------
CREATE TABLE WAREHOUSE (
    WarehouseID   INT          NOT NULL AUTO_INCREMENT,
    WarehouseName VARCHAR(100) NOT NULL,
    Location      VARCHAR(255),
    CONSTRAINT pk_warehouse PRIMARY KEY (WarehouseID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 14-17. Disposition tables. Each inspection ends in exactly ONE of
--        RESTOCK / REFURBISH / DISPOSE / REJECT. UNIQUE(InspectionID)
--        prevents duplicates within a table; triggers prevent an
--        inspection from appearing in two different tables.
-- ---------------------------------------------------------------------
CREATE TABLE RESTOCK (
    RestockID    INT  NOT NULL AUTO_INCREMENT,
    InspectionID INT  NOT NULL,
    RestockDate  DATE NOT NULL,
    NewStockQty  INT  NOT NULL,
    WarehouseID  INT  NOT NULL,
    CONSTRAINT pk_restock PRIMARY KEY (RestockID),
    CONSTRAINT uq_restock_inspection UNIQUE (InspectionID),
    CONSTRAINT fk_restock_inspection
        FOREIGN KEY (InspectionID) REFERENCES INSPECTION(InspectionID),
    CONSTRAINT fk_restock_warehouse
        FOREIGN KEY (WarehouseID) REFERENCES WAREHOUSE(WarehouseID)
) ENGINE=InnoDB;

CREATE TABLE REFURBISH (
    RefurbishID   INT          NOT NULL AUTO_INCREMENT,
    InspectionID  INT          NOT NULL,
    RefurbishDate DATE         NOT NULL,
    Details       VARCHAR(500),
    WarehouseID   INT          NOT NULL,
    CONSTRAINT pk_refurbish PRIMARY KEY (RefurbishID),
    CONSTRAINT uq_refurbish_inspection UNIQUE (InspectionID),
    CONSTRAINT fk_refurbish_inspection
        FOREIGN KEY (InspectionID) REFERENCES INSPECTION(InspectionID),
    CONSTRAINT fk_refurbish_warehouse
        FOREIGN KEY (WarehouseID) REFERENCES WAREHOUSE(WarehouseID)
) ENGINE=InnoDB;

CREATE TABLE DISPOSE (
    DisposeID      INT          NOT NULL AUTO_INCREMENT,
    InspectionID   INT          NOT NULL,
    DisposeDate    DATE         NOT NULL,
    Reason         VARCHAR(255),
    DisposalMethod VARCHAR(100) NOT NULL,
    WarehouseID    INT          NOT NULL,
    CONSTRAINT pk_dispose PRIMARY KEY (DisposeID),
    CONSTRAINT uq_dispose_inspection UNIQUE (InspectionID),
    CONSTRAINT fk_dispose_inspection
        FOREIGN KEY (InspectionID) REFERENCES INSPECTION(InspectionID),
    CONSTRAINT fk_dispose_warehouse
        FOREIGN KEY (WarehouseID) REFERENCES WAREHOUSE(WarehouseID)
) ENGINE=InnoDB;

CREATE TABLE REJECT (
    RejectID     INT          NOT NULL AUTO_INCREMENT,
    InspectionID INT          NOT NULL,
    RejectDate   DATE         NOT NULL,
    Reason       VARCHAR(255) NOT NULL,
    CONSTRAINT pk_reject PRIMARY KEY (RejectID),
    CONSTRAINT uq_reject_inspection UNIQUE (InspectionID),
    CONSTRAINT fk_reject_inspection
        FOREIGN KEY (InspectionID) REFERENCES INSPECTION(InspectionID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 18. INVENTORY  (stock recovered into each warehouse; maintained by the
--     RESTOCK trigger). Composite primary key = one row per product per
--     warehouse.
-- ---------------------------------------------------------------------
CREATE TABLE INVENTORY (
    ProductID   INT       NOT NULL,
    WarehouseID INT       NOT NULL,
    Quantity    INT       NOT NULL DEFAULT 0,
    UpdatedAt   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_inventory PRIMARY KEY (ProductID, WarehouseID),
    CONSTRAINT fk_inventory_product
        FOREIGN KEY (ProductID) REFERENCES PRODUCT(ProductID),
    CONSTRAINT fk_inventory_warehouse
        FOREIGN KEY (WarehouseID) REFERENCES WAREHOUSE(WarehouseID)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 19. RETURN_STATUS_HISTORY  (audit trail written only by a trigger)
-- ---------------------------------------------------------------------
CREATE TABLE RETURN_STATUS_HISTORY (
    HistoryID  INT         NOT NULL AUTO_INCREMENT,
    ReturnID   INT         NOT NULL,
    OldStatus  VARCHAR(50),
    NewStatus  VARCHAR(50) NOT NULL,
    ChangedBy  INT         NULL,
    ChangedAt  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_return_status_history PRIMARY KEY (HistoryID),
    CONSTRAINT fk_history_return
        FOREIGN KEY (ReturnID) REFERENCES RETURNS(ReturnID),
    CONSTRAINT fk_history_user
        FOREIGN KEY (ChangedBy) REFERENCES APP_USER(UserID)
) ENGINE=InnoDB;
