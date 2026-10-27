-- =====================================================================
-- 04_triggers.sql : triggers enforcing cross-table business rules
--
-- CHECK constraints can only look at one row. These triggers enforce
-- rules that span tables and keep derived data consistent:
--
--   ORDER_ITEM  -> keep ORDERS.TotalAmount = SUM(Quantity * UnitPrice)
--   RETURNS     -> 30-day window, delivered orders only, quantity limit,
--                  workflow state machine, automatic audit history
--   PICKUP      -> only for approved returns; drives return status
--   INSPECTION  -> only after pickup; marks return as Inspected
--   RESTOCK / REFURBISH / DISPOSE / REJECT
--               -> exactly one disposition per inspection;
--                  restock updates INVENTORY; reject closes the return
--   REFUND      -> only after inspection, never above item value,
--                  processed refunds are immutable; marks return Refunded
--
-- The application sets the session variable @app_user_id before writing,
-- so the audit trail records which user made each status change.
-- =====================================================================

USE ReverseLogisticsDB;

DROP TRIGGER IF EXISTS trg_order_item_after_insert;
DROP TRIGGER IF EXISTS trg_order_item_after_update;
DROP TRIGGER IF EXISTS trg_order_item_after_delete;
DROP TRIGGER IF EXISTS trg_returns_before_insert;
DROP TRIGGER IF EXISTS trg_returns_after_insert;
DROP TRIGGER IF EXISTS trg_returns_before_update;
DROP TRIGGER IF EXISTS trg_returns_after_update;
DROP TRIGGER IF EXISTS trg_pickup_before_insert;
DROP TRIGGER IF EXISTS trg_pickup_after_insert;
DROP TRIGGER IF EXISTS trg_pickup_before_update;
DROP TRIGGER IF EXISTS trg_pickup_after_update;
DROP TRIGGER IF EXISTS trg_inspection_before_insert;
DROP TRIGGER IF EXISTS trg_inspection_after_insert;
DROP TRIGGER IF EXISTS trg_restock_before_insert;
DROP TRIGGER IF EXISTS trg_restock_after_insert;
DROP TRIGGER IF EXISTS trg_refurbish_before_insert;
DROP TRIGGER IF EXISTS trg_dispose_before_insert;
DROP TRIGGER IF EXISTS trg_reject_before_insert;
DROP TRIGGER IF EXISTS trg_reject_after_insert;
DROP TRIGGER IF EXISTS trg_refund_before_insert;
DROP TRIGGER IF EXISTS trg_refund_after_insert;
DROP TRIGGER IF EXISTS trg_refund_before_update;
DROP TRIGGER IF EXISTS trg_refund_after_update;

DELIMITER //

-- ---------------------------------------------------------------------
-- ORDER_ITEM: keep the order total consistent with its items
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_order_item_after_insert
AFTER INSERT ON ORDER_ITEM
FOR EACH ROW
BEGIN
    UPDATE ORDERS
       SET TotalAmount = (SELECT COALESCE(SUM(Quantity * UnitPrice), 0)
                            FROM ORDER_ITEM WHERE OrderID = NEW.OrderID)
     WHERE OrderID = NEW.OrderID;
END //

CREATE TRIGGER trg_order_item_after_update
AFTER UPDATE ON ORDER_ITEM
FOR EACH ROW
BEGIN
    UPDATE ORDERS o
       SET o.TotalAmount = (SELECT COALESCE(SUM(oi.Quantity * oi.UnitPrice), 0)
                              FROM ORDER_ITEM oi WHERE oi.OrderID = o.OrderID)
     WHERE o.OrderID IN (NEW.OrderID, OLD.OrderID);
END //

CREATE TRIGGER trg_order_item_after_delete
AFTER DELETE ON ORDER_ITEM
FOR EACH ROW
BEGIN
    UPDATE ORDERS
       SET TotalAmount = (SELECT COALESCE(SUM(Quantity * UnitPrice), 0)
                            FROM ORDER_ITEM WHERE OrderID = OLD.OrderID)
     WHERE OrderID = OLD.OrderID;
END //

-- ---------------------------------------------------------------------
-- RETURNS: validation on insert
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_returns_before_insert
BEFORE INSERT ON RETURNS
FOR EACH ROW
BEGIN
    DECLARE v_order_id     INT         DEFAULT NULL;
    DECLARE v_order_date   DATE;
    DECLARE v_order_status VARCHAR(50);
    DECLARE v_ordered_qty  INT;
    DECLARE v_already      INT;

    SELECT oi.OrderID, o.OrderDate, o.OrderStatus, oi.Quantity
      INTO v_order_id, v_order_date, v_order_status, v_ordered_qty
      FROM ORDER_ITEM oi
      JOIN ORDERS o ON o.OrderID = oi.OrderID
     WHERE oi.OrderItemID = NEW.OrderItemID;

    IF v_order_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order item does not exist.';
    END IF;

    -- OrderID is always derived from the order item, never trusted from input.
    SET NEW.OrderID = v_order_id;

    IF NEW.ReturnStatus <> 'Requested' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new return must start in Requested status.';
    END IF;

    IF v_order_status <> 'Delivered' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only delivered orders can be returned.';
    END IF;

    IF NEW.ReturnDate < v_order_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Return date cannot be before the order date.';
    END IF;

    IF NEW.ReturnDate > DATE_ADD(v_order_date, INTERVAL 30 DAY) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The 30-day return window for this order has expired.';
    END IF;

    SELECT COALESCE(SUM(ReturnQty), 0)
      INTO v_already
      FROM RETURNS
     WHERE OrderItemID = NEW.OrderItemID
       AND ReturnStatus <> 'Rejected';

    IF v_already + NEW.ReturnQty > v_ordered_qty THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Return quantity exceeds the quantity ordered (including earlier returns).';
    END IF;
END //

CREATE TRIGGER trg_returns_after_insert
AFTER INSERT ON RETURNS
FOR EACH ROW
BEGIN
    INSERT INTO RETURN_STATUS_HISTORY (ReturnID, OldStatus, NewStatus, ChangedBy)
    VALUES (NEW.ReturnID, NULL, NEW.ReturnStatus, @app_user_id);
END //

-- ---------------------------------------------------------------------
-- RETURNS: workflow state machine + audit trail
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_returns_before_update
BEFORE UPDATE ON RETURNS
FOR EACH ROW
BEGIN
    IF NEW.OrderItemID <> OLD.OrderItemID
       OR NEW.OrderID <> OLD.OrderID
       OR NEW.ReturnQty <> OLD.ReturnQty THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'The item and quantity of a return cannot be changed.';
    END IF;

    IF NEW.ReturnStatus <> OLD.ReturnStatus
       AND NOT fn_is_valid_return_transition(OLD.ReturnStatus, NEW.ReturnStatus) THEN
        SET @rl_msg = CONCAT('Invalid return status change: ',
                             OLD.ReturnStatus, ' -> ', NEW.ReturnStatus, '.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @rl_msg;
    END IF;
END //

CREATE TRIGGER trg_returns_after_update
AFTER UPDATE ON RETURNS
FOR EACH ROW
BEGIN
    IF NEW.ReturnStatus <> OLD.ReturnStatus THEN
        INSERT INTO RETURN_STATUS_HISTORY (ReturnID, OldStatus, NewStatus, ChangedBy)
        VALUES (NEW.ReturnID, OLD.ReturnStatus, NEW.ReturnStatus, @app_user_id);
    END IF;
END //

-- ---------------------------------------------------------------------
-- PICKUP
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_pickup_before_insert
BEFORE INSERT ON PICKUP
FOR EACH ROW
BEGIN
    DECLARE v_status      VARCHAR(50) DEFAULT NULL;
    DECLARE v_return_date DATE;

    SELECT ReturnStatus, ReturnDate INTO v_status, v_return_date
      FROM RETURNS WHERE ReturnID = NEW.ReturnID;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Return does not exist.';
    END IF;

    IF v_status <> 'Approved' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A pickup can only be scheduled for an approved return.';
    END IF;

    IF NEW.PickupStatus <> 'Scheduled' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A new pickup must start in Scheduled status.';
    END IF;

    IF NEW.PickupDate < v_return_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pickup date cannot be before the return date.';
    END IF;
END //

CREATE TRIGGER trg_pickup_after_insert
AFTER INSERT ON PICKUP
FOR EACH ROW
BEGIN
    UPDATE RETURNS SET ReturnStatus = 'Pickup Scheduled' WHERE ReturnID = NEW.ReturnID;
END //

-- Pickup lifecycle: Scheduled -> Picked Up | Failed | Cancelled,
-- Failed / Cancelled -> Scheduled (reschedule). Picked Up is final.
CREATE TRIGGER trg_pickup_before_update
BEFORE UPDATE ON PICKUP
FOR EACH ROW
BEGIN
    IF NEW.ReturnID <> OLD.ReturnID THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A pickup cannot be moved to another return.';
    END IF;

    IF NEW.PickupStatus <> OLD.PickupStatus AND NOT (
           (OLD.PickupStatus = 'Scheduled' AND NEW.PickupStatus IN ('Picked Up', 'Failed', 'Cancelled'))
        OR (OLD.PickupStatus IN ('Failed', 'Cancelled') AND NEW.PickupStatus = 'Scheduled')
    ) THEN
        SET @rl_msg = CONCAT('Invalid pickup status change: ',
                             OLD.PickupStatus, ' -> ', NEW.PickupStatus, '.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = @rl_msg;
    END IF;
END //

CREATE TRIGGER trg_pickup_after_update
AFTER UPDATE ON PICKUP
FOR EACH ROW
BEGIN
    IF NEW.PickupStatus <> OLD.PickupStatus THEN
        UPDATE RETURNS
           SET ReturnStatus = CASE NEW.PickupStatus
                                  WHEN 'Picked Up' THEN 'Picked Up'
                                  WHEN 'Scheduled' THEN 'Pickup Scheduled'
                                  ELSE 'Approved'  -- Failed / Cancelled
                              END
         WHERE ReturnID = NEW.ReturnID;
    END IF;
END //

-- ---------------------------------------------------------------------
-- INSPECTION
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_inspection_before_insert
BEFORE INSERT ON INSPECTION
FOR EACH ROW
BEGIN
    DECLARE v_pickup_status VARCHAR(50) DEFAULT NULL;
    DECLARE v_pickup_date   DATE;

    SELECT PickupStatus, PickupDate INTO v_pickup_status, v_pickup_date
      FROM PICKUP WHERE ReturnID = NEW.ReturnID;

    IF v_pickup_status IS NULL OR v_pickup_status <> 'Picked Up' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The item must be picked up before it can be inspected.';
    END IF;

    IF NEW.InspectionDate < v_pickup_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Inspection date cannot be before the pickup date.';
    END IF;
END //

CREATE TRIGGER trg_inspection_after_insert
AFTER INSERT ON INSPECTION
FOR EACH ROW
BEGIN
    UPDATE RETURNS SET ReturnStatus = 'Inspected' WHERE ReturnID = NEW.ReturnID;
END //

-- ---------------------------------------------------------------------
-- Dispositions: exactly one per inspection
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_restock_before_insert
BEFORE INSERT ON RESTOCK
FOR EACH ROW
BEGIN
    DECLARE v_qty INT;

    CALL sp_assert_no_disposition(NEW.InspectionID);

    SELECT r.ReturnQty INTO v_qty
      FROM INSPECTION i JOIN RETURNS r ON r.ReturnID = i.ReturnID
     WHERE i.InspectionID = NEW.InspectionID;

    IF NEW.NewStockQty > v_qty THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot restock more units than were returned.';
    END IF;
END //

-- Restocked units go back into sellable inventory at that warehouse.
CREATE TRIGGER trg_restock_after_insert
AFTER INSERT ON RESTOCK
FOR EACH ROW
BEGIN
    INSERT INTO INVENTORY (ProductID, WarehouseID, Quantity)
    SELECT oi.ProductID, NEW.WarehouseID, NEW.NewStockQty
      FROM INSPECTION i
      JOIN RETURNS r     ON r.ReturnID = i.ReturnID
      JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
     WHERE i.InspectionID = NEW.InspectionID
    ON DUPLICATE KEY UPDATE INVENTORY.Quantity = INVENTORY.Quantity + NEW.NewStockQty;
END //

CREATE TRIGGER trg_refurbish_before_insert
BEFORE INSERT ON REFURBISH
FOR EACH ROW
BEGIN
    CALL sp_assert_no_disposition(NEW.InspectionID);
END //

CREATE TRIGGER trg_dispose_before_insert
BEFORE INSERT ON DISPOSE
FOR EACH ROW
BEGIN
    CALL sp_assert_no_disposition(NEW.InspectionID);
END //

CREATE TRIGGER trg_reject_before_insert
BEFORE INSERT ON REJECT
FOR EACH ROW
BEGIN
    CALL sp_assert_no_disposition(NEW.InspectionID);
END //

-- A return rejected at inspection is closed without a refund.
CREATE TRIGGER trg_reject_after_insert
AFTER INSERT ON REJECT
FOR EACH ROW
BEGIN
    UPDATE RETURNS r
      JOIN INSPECTION i ON i.ReturnID = r.ReturnID
       SET r.ReturnStatus = 'Closed'
     WHERE i.InspectionID = NEW.InspectionID;
END //

-- ---------------------------------------------------------------------
-- REFUND
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_refund_before_insert
BEFORE INSERT ON REFUND
FOR EACH ROW
BEGIN
    DECLARE v_status    VARCHAR(50) DEFAULT NULL;
    DECLARE v_max       DECIMAL(10,2);

    SELECT r.ReturnStatus, r.ReturnQty * oi.UnitPrice
      INTO v_status, v_max
      FROM PICKUP p
      JOIN RETURNS r     ON r.ReturnID = p.ReturnID
      JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
     WHERE p.PickupID = NEW.PickupID;

    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pickup does not exist.';
    END IF;

    IF v_status <> 'Inspected' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A refund can only be issued for an inspected, non-rejected return.';
    END IF;

    IF NEW.RefundAmount > v_max THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Refund amount exceeds the value of the returned items.';
    END IF;
END //

CREATE TRIGGER trg_refund_after_insert
AFTER INSERT ON REFUND
FOR EACH ROW
BEGIN
    IF NEW.RefundStatus = 'Processed' THEN
        UPDATE RETURNS r
          JOIN PICKUP p ON p.ReturnID = r.ReturnID
           SET r.ReturnStatus = 'Refunded'
         WHERE p.PickupID = NEW.PickupID;
    END IF;
END //

CREATE TRIGGER trg_refund_before_update
BEFORE UPDATE ON REFUND
FOR EACH ROW
BEGIN
    DECLARE v_max DECIMAL(10,2);

    IF OLD.RefundStatus = 'Processed' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A processed refund cannot be modified.';
    END IF;

    IF NEW.PickupID <> OLD.PickupID THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A refund cannot be moved to another pickup.';
    END IF;

    SELECT r.ReturnQty * oi.UnitPrice INTO v_max
      FROM PICKUP p
      JOIN RETURNS r     ON r.ReturnID = p.ReturnID
      JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
     WHERE p.PickupID = NEW.PickupID;

    IF NEW.RefundAmount > v_max THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Refund amount exceeds the value of the returned items.';
    END IF;
END //

CREATE TRIGGER trg_refund_after_update
AFTER UPDATE ON REFUND
FOR EACH ROW
BEGIN
    IF NEW.RefundStatus = 'Processed' AND OLD.RefundStatus <> 'Processed' THEN
        UPDATE RETURNS r
          JOIN PICKUP p ON p.ReturnID = r.ReturnID
           SET r.ReturnStatus = 'Refunded'
         WHERE p.PickupID = NEW.PickupID;
    END IF;
END //

DELIMITER ;
