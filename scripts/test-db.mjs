// Database test suite: verifies that MySQL and MongoDB enforce the data
// integrity rules (constraints, triggers, procedures, views, indexes,
// validators). Every MySQL test runs inside a transaction that is rolled
// back, so the database is left unchanged.
//
//   npm run test:db          (after npm run db:setup and npm run mongo:setup)
//
// Results are printed and written to docs/test-results.md.
import fs from "node:fs";
import { MongoClient } from "mongodb";
import { connect } from "./sql-runner.mjs";

const tests = [];
// options.noTransaction: for tests that CALL a procedure which starts its
// own transaction (that would implicitly commit an outer one).
const test = (category, name, expected, fn, options = {}) =>
  tests.push({ category, name, expected, fn, noTransaction: Boolean(options.noTransaction) });

// Runs SQL that must fail; returns the database error message.
async function expectError(conn, sql, params, pattern) {
  try {
    await conn.query(sql, params);
  } catch (error) {
    const message = `${error.errno ?? ""} ${error.sqlMessage ?? error.message}`;
    if (!pattern.test(message)) throw new Error(`Unexpected error: ${message}`);
    return error.sqlMessage ?? error.message;
  }
  throw new Error("Statement succeeded but should have been rejected.");
}

async function scalar(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return Object.values(rows[0])[0];
}

function assertEqual(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  return `${label} = ${actual}`;
}

// ---------------------------------------------------------------------
// CHECK, UNIQUE and FOREIGN KEY constraints
// ---------------------------------------------------------------------
test("Constraint", "Invalid email format is rejected", "chk_customer_email violated", (c) =>
  expectError(c, "INSERT INTO CUSTOMER (Name, Email) VALUES ('Test', 'not-an-email')", [], /chk_customer_email/));

test("Constraint", "Invalid phone number is rejected", "chk_customer_phone violated", (c) =>
  expectError(c, "INSERT INTO CUSTOMER (Name, Email, Phone) VALUES ('Test', 't@example.com', '12345')", [], /chk_customer_phone/));

test("Constraint", "Unknown customer type is rejected", "chk_customer_type violated", (c) =>
  expectError(c, "INSERT INTO CUSTOMER (Name, Email, CustomerType) VALUES ('Test', 't@example.com', 'Gold')", [], /chk_customer_type/));

test("Constraint", "Duplicate customer email is rejected", "1062 duplicate entry", (c) =>
  expectError(c, "INSERT INTO CUSTOMER (Name, Email) VALUES ('Copy', 'rahul@example.com')", [], /^1062/));

test("Constraint", "Negative product price is rejected", "chk_product_price violated", (c) =>
  expectError(c, "INSERT INTO PRODUCT (ProductName, SKU, UnitPrice, CategoryID) VALUES ('X', 'NEG1', -5, 1)", [], /chk_product_price/));

test("Constraint", "Duplicate SKU is rejected", "1062 duplicate entry", (c) =>
  expectError(c, "INSERT INTO PRODUCT (ProductName, SKU, UnitPrice, CategoryID) VALUES ('X', 'ELEC101', 10, 1)", [], /^1062/));

test("Constraint", "Product with unknown category is rejected", "1452 foreign key", (c) =>
  expectError(c, "INSERT INTO PRODUCT (ProductName, SKU, UnitPrice, CategoryID) VALUES ('X', 'FK1', 10, 99)", [], /^1452/));

test("Constraint", "Order item quantity 0 is rejected", "chk_orderitem_quantity violated", (c) =>
  expectError(c, "INSERT INTO ORDER_ITEM (OrderID, ProductID, Quantity, UnitPrice) VALUES (1, 1, 0, 10)", [], /chk_orderitem_quantity/));

test("Constraint", "Unknown order status is rejected", "chk_order_status violated", (c) =>
  expectError(c, "UPDATE ORDERS SET OrderStatus = 'Lost' WHERE OrderID = 1", [], /chk_order_status/));

test("Constraint", "Unknown payment method is rejected", "chk_order_payment violated", (c) =>
  expectError(c, "INSERT INTO ORDERS (OrderDate, PaymentMethod, CustomerID) VALUES (CURDATE(), 'Bitcoin', 1)", [], /chk_order_payment/));

test("Constraint", "Customer login without a customer record is rejected", "chk_app_user_customer_link violated", (c) =>
  expectError(c, "INSERT INTO APP_USER (Username, PasswordHash, Role) VALUES ('ghost', 'x', 'Customer')", [], /chk_app_user_customer_link/));

test("Constraint", "Unknown role is rejected", "chk_app_user_role violated", (c) =>
  expectError(c, "INSERT INTO APP_USER (Username, PasswordHash, Role) VALUES ('boss', 'x', 'Manager')", [], /chk_app_user_role/));

test("Constraint", "Customer with orders cannot be deleted", "1451 foreign key RESTRICT", (c) =>
  expectError(c, "DELETE FROM CUSTOMER WHERE CustomerID = 5", [], /^1451/));

test("Constraint", "Refund method outside the allowed list is rejected", "chk_refund_method violated", (c) =>
  expectError(c, "INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod) VALUES (6, CURDATE(), 100, 'Cash')", [], /chk_refund_method/));

// ---------------------------------------------------------------------
// Triggers: return rules
// ---------------------------------------------------------------------
test("Trigger", "OrderID of a return is derived from the order item", "OrderID = 21 (client sent 1)", async (c) => {
  await c.query("INSERT INTO RETURNS (OrderItemID, OrderID, ReturnQty, ReturnReasonID) VALUES (27, 1, 1, 1)");
  return assertEqual(await scalar(c, "SELECT OrderID FROM RETURNS WHERE ReturnID = LAST_INSERT_ID()"), 21, "OrderID");
});

test("Trigger", "Return outside the 30-day window is rejected", "SIGNAL: return window expired", (c) =>
  expectError(c, "INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID) VALUES (4, 1, 1)", [], /30-day return window/));

test("Trigger", "Return on an undelivered order is rejected", "SIGNAL: only delivered orders", (c) =>
  expectError(c, "INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID) VALUES (23, 1, 1)", [], /Only delivered orders/));

test("Trigger", "Return quantity above quantity ordered is rejected", "SIGNAL: quantity exceeds", (c) =>
  expectError(c, "INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID) VALUES (27, 5, 1)", [], /exceeds the quantity ordered/));

test("Trigger", "Earlier returns count toward the quantity limit", "SIGNAL: quantity exceeds (1 of 2 already returned)", (c) =>
  expectError(c, "INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID) VALUES (20, 2, 5)", [], /exceeds the quantity ordered/));

test("Trigger", "A new return cannot start as Approved", "SIGNAL: must start in Requested", (c) =>
  expectError(c, "INSERT INTO RETURNS (OrderItemID, ReturnQty, ReturnReasonID, ReturnStatus) VALUES (27, 1, 1, 'Approved')", [], /must start in Requested/));

test("Trigger", "Skipping workflow steps is rejected (Requested -> Refunded)", "SIGNAL: invalid status change", (c) =>
  expectError(c, "UPDATE RETURNS SET ReturnStatus = 'Refunded' WHERE ReturnID = 11", [], /Invalid return status change: Requested -> Refunded/));

test("Trigger", "Item and quantity of a return cannot be changed", "SIGNAL: cannot be changed", (c) =>
  expectError(c, "UPDATE RETURNS SET ReturnQty = 2 WHERE ReturnID = 13", [], /cannot be changed/));

test("Trigger", "A valid status change is written to the audit history", "1 new RETURN_STATUS_HISTORY row by user 2", async (c) => {
  const before = await scalar(c, "SELECT COUNT(*) FROM RETURN_STATUS_HISTORY WHERE ReturnID = 11");
  await c.query("UPDATE RETURNS SET ReturnStatus = 'Approved' WHERE ReturnID = 11");
  const after = await scalar(c, "SELECT COUNT(*) FROM RETURN_STATUS_HISTORY WHERE ReturnID = 11");
  const by = await scalar(c, "SELECT ChangedBy FROM RETURN_STATUS_HISTORY WHERE ReturnID = 11 ORDER BY HistoryID DESC LIMIT 1");
  assertEqual(after - before, 1, "new history rows");
  return assertEqual(by, 2, "ChangedBy");
});

// ---------------------------------------------------------------------
// Triggers: pickup, inspection, disposition, refund
// ---------------------------------------------------------------------
test("Trigger", "Pickup for a return that is not approved is rejected", "SIGNAL: approved return only", (c) =>
  expectError(c, "INSERT INTO PICKUP (ReturnID, PickupDate, PickupAddress, CourierID) VALUES (12, CURDATE(), 'x', 1)", [], /approved return/));

test("Trigger", "Pickup dated before the return is rejected", "SIGNAL: pickup before return date", (c) =>
  expectError(c, "INSERT INTO PICKUP (ReturnID, PickupDate, PickupAddress, CourierID) VALUES (9, '2026-10-01', 'x', 1)", [], /before the return date/));

test("Trigger", "Scheduling a pickup moves the return to Pickup Scheduled", "ReturnStatus = Pickup Scheduled", async (c) => {
  await c.query("INSERT INTO PICKUP (ReturnID, PickupDate, PickupAddress, CourierID) VALUES (9, CURDATE(), 'x', 1)");
  return assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = 9"), "Pickup Scheduled", "ReturnStatus");
});

test("Trigger", "A completed pickup cannot be reopened", "SIGNAL: invalid pickup status change", (c) =>
  expectError(c, "UPDATE PICKUP SET PickupStatus = 'Scheduled' WHERE PickupID = 1", [], /Invalid pickup status change/));

test("Trigger", "Inspection before pickup is rejected", "SIGNAL: must be picked up first", (c) =>
  expectError(c, "INSERT INTO INSPECTION (InspectionDate, ProductCondition, ReturnID) VALUES (CURDATE(), 'Good', 8)", [], /picked up before/));

test("Trigger", "An inspection cannot get a second disposition", "SIGNAL: already has a disposition", (c) =>
  expectError(c, "INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID) VALUES (1, CURDATE(), 1, 1)", [], /already has a disposition/));

test("Trigger", "Restocking adds the units to INVENTORY", "INVENTORY(Steam Iron, warehouse 2) = 1, return Inspected", async (c) => {
  await c.query("INSERT INTO INSPECTION (InspectionDate, ProductCondition, ReturnID, InspectorID) VALUES (CURDATE(), 'Like New', 7, 2)");
  await c.query("INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID) VALUES (LAST_INSERT_ID(), CURDATE(), 1, 2)");
  assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = 7"), "Inspected", "ReturnStatus");
  return assertEqual(await scalar(c, "SELECT Quantity FROM INVENTORY WHERE ProductID = 10 AND WarehouseID = 2"), 1, "INVENTORY.Quantity");
});

test("Trigger", "Restocking more units than returned is rejected", "SIGNAL: cannot restock more", async (c) => {
  await c.query("INSERT INTO INSPECTION (InspectionDate, ProductCondition, ReturnID) VALUES (CURDATE(), 'Good', 7)");
  return expectError(c, "INSERT INTO RESTOCK (InspectionID, RestockDate, NewStockQty, WarehouseID) VALUES (LAST_INSERT_ID(), CURDATE(), 5, 1)", [], /Cannot restock more/);
});

test("Trigger", "Rejecting at inspection closes the return with no refund", "ReturnStatus = Closed, fn_calculate_refund = 0", async (c) => {
  await c.query("INSERT INTO INSPECTION (InspectionDate, ProductCondition, ReturnID) VALUES (CURDATE(), 'Damaged', 7)");
  await c.query("INSERT INTO REJECT (InspectionID, RejectDate, Reason) VALUES (LAST_INSERT_ID(), CURDATE(), 'Used item')");
  assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = 7"), "Closed", "ReturnStatus");
  return assertEqual(await scalar(c, "SELECT fn_calculate_refund(7)"), "0.00", "refund");
});

test("Trigger", "Refund before inspection is rejected", "SIGNAL: inspected returns only", (c) =>
  expectError(c, "INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod) VALUES (7, CURDATE(), 100, 'UPI')", [], /inspected, non-rejected/));

test("Trigger", "Refund above the item value is rejected", "SIGNAL: exceeds item value", (c) =>
  expectError(c, "INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod) VALUES (6, CURDATE(), 99999, 'UPI')", [], /exceeds the value/));

test("Trigger", "A processed refund cannot be modified", "SIGNAL: processed refund immutable", (c) =>
  expectError(c, "UPDATE REFUND SET RefundAmount = 1 WHERE RefundID = 1", [], /cannot be modified/));

test("Trigger", "A processed refund marks the return Refunded", "ReturnStatus = Refunded", async (c) => {
  await c.query("INSERT INTO REFUND (PickupID, RefundDate, RefundAmount, RefundMethod, RefundStatus) VALUES (6, CURDATE(), 1800, 'UPI', 'Processed')");
  return assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = 6"), "Refunded", "ReturnStatus");
});

test("Trigger", "Order total is maintained from its items", "TotalAmount = 2 x 799 = 1598, then 3 x 799 = 2397", async (c) => {
  const [order] = await c.query("INSERT INTO ORDERS (OrderDate, PaymentMethod, CustomerID) VALUES (CURDATE(), 'UPI', 1)");
  await c.query("INSERT INTO ORDER_ITEM (OrderID, ProductID, Quantity, UnitPrice) VALUES (?, 2, 2, 799)", [order.insertId]);
  assertEqual(await scalar(c, "SELECT TotalAmount FROM ORDERS WHERE OrderID = ?", [order.insertId]), "1598.00", "after insert");
  await c.query("UPDATE ORDER_ITEM SET Quantity = 3 WHERE OrderID = ?", [order.insertId]);
  return assertEqual(await scalar(c, "SELECT TotalAmount FROM ORDERS WHERE OrderID = ?", [order.insertId]), "2397.00", "after update");
});

// ---------------------------------------------------------------------
// Stored functions and procedures
// ---------------------------------------------------------------------
test("Function", "Seller-fault return is refunded in full", "fn_calculate_refund(6) = 1800.00", async (c) =>
  assertEqual(await scalar(c, "SELECT fn_calculate_refund(6)"), "1800.00", "refund"));

test("Function", "Change-of-mind return in Good condition gets 90 %", "fn_calculate_refund(3) = 1438.20", async (c) =>
  assertEqual(await scalar(c, "SELECT fn_calculate_refund(3)"), "1438.20", "refund"));

test("Function", "State machine allows Inspected -> Refunded only forwards", "valid = 1, reverse = 0", async (c) => {
  assertEqual(await scalar(c, "SELECT fn_is_valid_return_transition('Inspected', 'Refunded')"), 1, "forward");
  return assertEqual(await scalar(c, "SELECT fn_is_valid_return_transition('Refunded', 'Inspected')"), 0, "reverse");
});

test("Procedure", "sp_register_return rejects another customer's item", "SIGNAL: does not belong to you", (c) =>
  expectError(c, "CALL sp_register_return(27, 1, 1, 'test', 2, @r)", [], /does not belong to you/));

test("Procedure", "sp_register_return creates a Requested return", "new ReturnID, status Requested", async (c) => {
  await c.query("CALL sp_register_return(28, 6, 1, 'Wrong colour', 1, @r)");
  const id = await scalar(c, "SELECT @r");
  return assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = ?", [id]), "Requested", `Return ${id} status`);
});

test("Procedure", "sp_complete_inspection records inspection + disposition", "INSPECTION + REFURBISH rows, return Inspected", async (c) => {
  await c.query("CALL sp_complete_inspection(7, 'Defective', 'Thermostat faulty', 'Refurbish', 3, 'Replace thermostat', NULL, 2, @i)");
  const id = await scalar(c, "SELECT @i");
  assertEqual(await scalar(c, "SELECT COUNT(*) FROM REFURBISH WHERE InspectionID = ?", [id]), 1, "REFURBISH rows");
  return assertEqual(await scalar(c, "SELECT ReturnStatus FROM RETURNS WHERE ReturnID = 7"), "Inspected", "ReturnStatus");
});

test("Procedure", "sp_process_refund rolls back on error (transaction + EXIT HANDLER)", "SIGNAL re-raised, no REFUND row created", async (c) => {
  const message = await expectError(c, "CALL sp_process_refund(7, 'UPI', 2, @rid, @amt)", [], /inspected, non-rejected/);
  assertEqual(await scalar(c, "SELECT COUNT(*) FROM REFUND WHERE PickupID = 7"), 0, "REFUND rows");
  return message;
}, { noTransaction: true });

// ---------------------------------------------------------------------
// Views, indexes, full-text search
// ---------------------------------------------------------------------
test("View", "ReturnPipelineView has one row per return", "14 rows", async (c) =>
  assertEqual(await scalar(c, "SELECT COUNT(*) FROM ReturnPipelineView"), 14, "rows"));

test("View", "PendingActionsView lists only open returns", "8 open returns", async (c) =>
  assertEqual(await scalar(c, "SELECT COUNT(*) FROM PendingActionsView"), 8, "rows"));

test("Index", "Status filter uses idx_returns_status", "EXPLAIN key = idx_returns_status", async (c) => {
  const [rows] = await c.query("EXPLAIN SELECT ReturnID FROM RETURNS WHERE ReturnStatus = 'Requested'");
  return assertEqual(rows[0].key, "idx_returns_status", "EXPLAIN key");
});

test("Full-text", "FULLTEXT search finds 'battery' in return comments", "Return 6 matched", async (c) => {
  const [rows] = await c.query("SELECT ReturnID FROM RETURNS WHERE MATCH(Comments) AGAINST ('battery*' IN BOOLEAN MODE)");
  return assertEqual(rows.map((r) => r.ReturnID).join(","), "6", "matches");
});

// ---------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------
const mongoTests = [];
const mtest = (name, expected, fn) => mongoTests.push({ category: "MongoDB", name, expected, fn });

async function expectMongoError(promise, code) {
  try {
    await promise;
  } catch (error) {
    if (error.code !== code) throw new Error(`Unexpected error ${error.code}: ${error.message}`);
    return `${error.code} ${error.codeName ?? ""}`.trim();
  }
  throw new Error("Write succeeded but should have been rejected.");
}

mtest("Validator rejects a condition score outside 1-10", "121 DocumentValidationFailure", (db) =>
  expectMongoError(
    db.collection("inspection_reports").insertOne({
      inspectionId: 999, returnId: 1, productId: 1, category: "Electronics",
      inspector: { userId: 2, username: "staff" }, inspectedAt: new Date(),
      conditionGrade: "Good", conditionScore: 15, disposition: "Restock",
      checklist: [{ item: "Powers on", passed: true }],
    }),
    121
  ));

mtest("Validator rejects an unknown event type", "121 DocumentValidationFailure", (db) =>
  expectMongoError(
    db.collection("return_events").insertOne({
      returnId: 1, type: "TELEPORTED", at: new Date(), actor: { role: "Staff" },
    }),
    121
  ));

mtest("Unique index prevents two reports for one inspection", "11000 DuplicateKey", async (db) => {
  const existing = await db.collection("inspection_reports").findOne({ inspectionId: 1 }, { projection: { _id: 0 } });
  return expectMongoError(db.collection("inspection_reports").insertOne(existing), 11000);
});

mtest("$text search ranks the matching inspection report", "inspection 6 is the top 'battery driver' hit", async (db) => {
  const [top] = await db.collection("inspection_reports")
    .find({ $text: { $search: "battery driver" } }, { projection: { inspectionId: 1, score: { $meta: "textScore" } } })
    .sort({ score: { $meta: "textScore" } })
    .limit(1)
    .toArray();
  return assertEqual(top?.inspectionId, 6, "top inspectionId");
});

mtest("Aggregation pipeline counts checklist failures", "at least one failing checklist item", async (db) => {
  const rows = await db.collection("inspection_reports").aggregate([
    { $unwind: "$checklist" },
    { $match: { "checklist.passed": false } },
    { $count: "failures" },
  ]).toArray();
  if (!rows[0] || rows[0].failures < 1) throw new Error("no failures counted");
  return `failures = ${rows[0].failures}`;
});

mtest("Every SQL inspection has a MongoDB report", "6 reports for 6 inspections", async (db) =>
  assertEqual(await db.collection("inspection_reports").countDocuments(), 6, "reports"));

// ---------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------
const results = [];
const sql = await connect();
await sql.query("SET @app_user_id = 2");

for (const t of tests) {
  try {
    if (!t.noTransaction) await sql.beginTransaction();
    const detail = await t.fn(sql);
    results.push({ ...t, pass: true, detail });
  } catch (error) {
    results.push({ ...t, pass: false, detail: error.message });
  } finally {
    if (!t.noTransaction) await sql.rollback();
  }
}
await sql.end();

const mongo = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017", { serverSelectionTimeoutMS: 3000 });
try {
  await mongo.connect();
  const db = mongo.db(process.env.MONGODB_DB || "reverse_logistics");
  for (const t of mongoTests) {
    try {
      results.push({ ...t, pass: true, detail: await t.fn(db) });
    } catch (error) {
      results.push({ ...t, pass: false, detail: error.message });
    }
  }
} catch (error) {
  for (const t of mongoTests) results.push({ ...t, pass: false, detail: `MongoDB unavailable: ${error.message}` });
} finally {
  await mongo.close();
}

const passed = results.filter((r) => r.pass).length;
console.table(results.map((r, i) => ({ "#": i + 1, category: r.category, test: r.name, result: r.pass ? "PASS" : "FAIL" })));
for (const r of results.filter((r) => !r.pass)) console.error(`FAIL: ${r.name}\n  ${r.detail}`);
console.log(`\n${passed} / ${results.length} tests passed.`);

const escape = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
const markdown = [
  "# Database test results",
  "",
  `Generated by \`npm run test:db\` on ${new Date().toISOString().slice(0, 10)}: **${passed} / ${results.length} passed**.`,
  "",
  "Every MySQL test runs inside a transaction that is rolled back afterwards.",
  "",
  "| # | Area | Test case | Expected | Actual | Result |",
  "|---|------|-----------|----------|--------|--------|",
  ...results.map((r, i) =>
    `| ${i + 1} | ${r.category} | ${escape(r.name)} | ${escape(r.expected)} | ${escape(r.detail)} | ${r.pass ? "PASS" : "FAIL"} |`
  ),
  "",
].join("\n");
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/test-results.md", markdown);
console.log("Report written to docs/test-results.md");

process.exit(passed === results.length ? 0 : 1);
