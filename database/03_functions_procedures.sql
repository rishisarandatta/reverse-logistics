-- =====================================================================
-- 03_functions_procedures.sql : stored functions and procedures
--
-- Business rules that need several queries (refund calculation, the
-- return workflow, inspection + disposition) live in the database so the
-- web application and any other client follow exactly the same logic.
--
-- DROP ... IF EXISTS makes this script safe to re-run after edits.
-- =====================================================================

USE ReverseLogisticsDB;

DROP FUNCTION  IF EXISTS fn_is_valid_return_transition;
DROP FUNCTION  IF EXISTS fn_calculate_refund;
DROP PROCEDURE IF EXISTS sp_assert_no_disposition;
DROP PROCEDURE IF EXISTS sp_register_return;
DROP PROCEDURE IF EXISTS sp_complete_inspection;
DROP PROCEDURE IF EXISTS sp_process_refund;
DROP PROCEDURE IF EXISTS GetCustomerOrders;

DELIMITER //

-- ---------------------------------------------------------------------
-- fn_is_valid_return_transition
-- The return workflow as a state machine. Used by the BEFORE UPDATE
-- trigger on RETURNS so no client can skip or reverse a step.
--
--   Requested -> Approved | Rejected
--   Approved -> Pickup Scheduled | Rejected
--   Pickup Scheduled -> Picked Up | Approved   (Approved = pickup failed)
--   Picked Up -> Inspected
--   Inspected -> Refunded | Closed             (Closed = rejected at inspection)
--   Refunded -> Closed
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_is_valid_return_transition(p_old VARCHAR(50), p_new VARCHAR(50))
RETURNS BOOLEAN
DETERMINISTIC
NO SQL
BEGIN
    RETURN (p_old = 'Requested'        AND p_new IN ('Approved', 'Rejected'))
        OR (p_old = 'Approved'         AND p_new IN ('Pickup Scheduled', 'Rejected'))
        OR (p_old = 'Pickup Scheduled' AND p_new IN ('Picked Up', 'Approved'))
        OR (p_old = 'Picked Up'        AND p_new = 'Inspected')
        OR (p_old = 'Inspected'        AND p_new IN ('Refunded', 'Closed'))
        OR (p_old = 'Refunded'         AND p_new = 'Closed');
END //

-- ---------------------------------------------------------------------
-- fn_calculate_refund
-- Refund policy:
--   * Seller fault (damaged / wrong / defective item): 100 % of item value.
--   * Otherwise the refund depends on the inspected condition:
--       Like New 100 %, Good 90 %, Fair 70 %, Damaged / Defective 40 %.
--   * A return rejected at inspection is not refundable (0).
-- Returns NULL if the return does not exist.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_calculate_refund(p_return_id INT)
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE v_item_value   DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_seller_fault BOOLEAN       DEFAULT FALSE;
    DECLARE v_condition    VARCHAR(100)  DEFAULT NULL;
    DECLARE v_rejected     INT           DEFAULT 0;

    SELECT r.ReturnQty * oi.UnitPrice,
           rr.IsSellerFault,
           i.ProductCondition,
           (SELECT COUNT(*) FROM REJECT rj WHERE rj.InspectionID = i.InspectionID)
      INTO v_item_value, v_seller_fault, v_condition, v_rejected
      FROM RETURNS r
      JOIN ORDER_ITEM oi    ON oi.OrderItemID = r.OrderItemID
      JOIN RETURN_REASON rr ON rr.ReturnReasonID = r.ReturnReasonID
      LEFT JOIN INSPECTION i ON i.ReturnID = r.ReturnID
     WHERE r.ReturnID = p_return_id;

    IF v_item_value IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_rejected > 0 THEN
        RETURN 0;
    END IF;

    IF v_seller_fault THEN
        RETURN v_item_value;
    END IF;

    RETURN ROUND(v_item_value * CASE v_condition
                                    WHEN 'Like New'  THEN 1.00
                                    WHEN 'Good'      THEN 0.90
                                    WHEN 'Fair'      THEN 0.70
                                    WHEN 'Damaged'   THEN 0.40
                                    WHEN 'Defective' THEN 0.40
                                    ELSE 1.00
                                END, 2);
END //

-- ---------------------------------------------------------------------
-- sp_assert_no_disposition
-- Raises an error if the inspection already has a disposition in any of
-- RESTOCK / REFURBISH / DISPOSE / REJECT. Called by the BEFORE INSERT
-- trigger of each disposition table.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_assert_no_disposition(IN p_inspection_id INT)
READS SQL DATA
BEGIN
    IF EXISTS (SELECT 1 FROM RESTOCK   WHERE InspectionID = p_inspection_id)
    OR EXISTS (SELECT 1 FROM REFURBISH WHERE InspectionID = p_inspection_id)
    OR EXISTS (SELECT 1 FROM DISPOSE   WHERE InspectionID = p_inspection_id)
    OR EXISTS (SELECT 1 FROM REJECT    WHERE InspectionID = p_inspection_id)
    THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'This inspection already has a disposition (restock/refurbish/dispose/reject).';
    END IF;
END //

-- ---------------------------------------------------------------------
-- sp_register_return
-- Creates a return request. When p_customer_id is given (a customer is
-- logged in) the order item must belong to that customer. Return window,
-- quantity and order-status rules are enforced by trg_returns_before_insert.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_register_return(
    IN  p_order_item_id INT,
    IN  p_reason_id     INT,
    IN  p_qty           INT,
    IN  p_comments      VARCHAR(500),
    IN  p_customer_id   INT,
    OUT p_return_id     INT
)
MODIFIES SQL DATA
BEGIN
    DECLARE v_owner INT DEFAULT NULL;

    SELECT o.CustomerID
      INTO v_owner
      FROM ORDER_ITEM oi
      JOIN ORDERS o ON o.OrderID = oi.OrderID
     WHERE oi.OrderItemID = p_order_item_id;

    IF v_owner IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order item does not exist.';
    END IF;

    IF p_customer_id IS NOT NULL AND v_owner <> p_customer_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This order item does not belong to you.';
    END IF;

    INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID, Comments)
    VALUES (p_order_item_id, p_qty, p_reason_id, NULLIF(TRIM(p_comments), ''));

    SET p_return_id = LAST_INSERT_ID();
END //

-- ---------------------------------------------------------------------
-- sp_complete_inspection
-- Records the inspection result and its single disposition.
-- p_disposition: 'Restock' | 'Refurbish' | 'Dispose' | 'Reject'
--   p_detail          -> REFURBISH.Details / DISPOSE.Reason / REJECT.Reason
--   p_disposal_method -> DISPOSE.DisposalMethod
-- This procedure does NOT start its own transaction: the API calls it
-- inside a transaction that also writes the MongoDB inspection report, and
-- rolls both back together if anything fails.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_complete_inspection(
    IN  p_return_id       INT,
    IN  p_condition       VARCHAR(100),
    IN  p_remarks         VARCHAR(500),
    IN  p_disposition     VARCHAR(20),
    IN  p_warehouse_id    INT,
    IN  p_detail          VARCHAR(500),
    IN  p_disposal_method VARCHAR(100),
    IN  p_inspector_id    INT,
    OUT p_inspection_id   INT
)
MODIFIES SQL DATA
BEGIN
    DECLARE v_qty INT DEFAULT NULL;

    SELECT ReturnQty INTO v_qty FROM RETURNS WHERE ReturnID = p_return_id;
    IF v_qty IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Return does not exist.';
    END IF;

    IF p_disposition NOT IN ('Restock', 'Refurbish', 'Dispose', 'Reject') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Disposition must be Restock, Refurbish, Dispose or Reject.';
    END IF;

    IF p_disposition <> 'Reject' AND p_warehouse_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A warehouse is required for restock, refurbish and dispose.';
    END IF;

    INSERT INTO INSPECTION (InspectionDate, ProductCondition, Remarks, ReturnID, InspectorID)
    VALUES (CURDATE(), p_condition, NULLIF(TRIM(p_remarks), ''), p_return_id, p_inspector_id);

    SET p_inspection_id = LAST_INSERT_ID();

    CASE p_disposition
        WHEN 'Restock' THEN
            INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID)
            VALUES (p_inspection_id, CURDATE(), v_qty, p_warehouse_id);
        WHEN 'Refurbish' THEN
            INSERT INTO REFURBISH (InspectionID, RefurbishDate, Details, WarehouseID)
            VALUES (p_inspection_id, CURDATE(), p_detail, p_warehouse_id);
        WHEN 'Dispose' THEN
            INSERT INTO DISPOSE (InspectionID, DisposeDate, Reason, DisposalMethod, WarehouseID)
            VALUES (p_inspection_id, CURDATE(), p_detail, p_disposal_method, p_warehouse_id);
        WHEN 'Reject' THEN
            INSERT INTO REJECT (InspectionID, RejectDate, Reason)
            VALUES (p_inspection_id, CURDATE(), COALESCE(NULLIF(TRIM(p_detail), ''), 'Rejected at inspection'));
    END CASE;
END //

-- ---------------------------------------------------------------------
-- sp_process_refund
-- Issues the refund for a picked-up, inspected return as one atomic
-- transaction. The pickup row is locked (SELECT ... FOR UPDATE) so two
-- staff members cannot refund the same return concurrently; any error
-- (including trigger SIGNALs) rolls the whole transaction back.
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_process_refund(
    IN  p_pickup_id INT,
    IN  p_method    VARCHAR(50),
    IN  p_user_id   INT,
    OUT p_refund_id INT,
    OUT p_amount    DECIMAL(10,2)
)
MODIFIES SQL DATA
BEGIN
    DECLARE v_return_id INT DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT ReturnID INTO v_return_id
      FROM PICKUP
     WHERE PickupID = p_pickup_id
       FOR UPDATE;

    IF v_return_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pickup does not exist.';
    END IF;

    SET p_amount = fn_calculate_refund(v_return_id);
    SET @app_user_id = p_user_id;

    INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod, RefundStatus)
    VALUES (p_pickup_id, CURDATE(), p_amount, p_method, 'Processed');

    SET p_refund_id = LAST_INSERT_ID();

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- GetCustomerOrders (from the original project)
-- ---------------------------------------------------------------------
CREATE PROCEDURE GetCustomerOrders(IN customer_id INT)
READS SQL DATA
BEGIN
    SELECT OrderID, OrderDate, TotalAmount, PaymentMethod, OrderStatus
      FROM ORDERS
     WHERE CustomerID = customer_id
     ORDER BY OrderDate DESC;
END //

DELIMITER ;
