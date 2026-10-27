// API / integration tests against a running server (npm run dev).
// Checks authentication, role-based authorization, error mapping and one
// complete return lifecycle across MySQL and MongoDB.
//
//   npm run test:api                  (BASE_URL defaults to http://localhost:3000)
//
// These tests WRITE data (a new order, return, refund, customer). Restore
// the demo data afterwards with: npm run db:reset && npm run mongo:setup
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];
const run = Date.now().toString(36);

class Client {
  cookie = "";
  async request(method, path, body) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  }
  login(username, password) {
    return this.request("POST", "/api/auth/login", { username, password });
  }
}

async function check(area, name, expected, fn) {
  try {
    const detail = await fn();
    results.push({ area, name, expected, pass: true, detail });
  } catch (error) {
    results.push({ area, name, expected, pass: false, detail: error.message });
  }
}

function expectStatus(res, status) {
  if (res.status !== status) {
    throw new Error(`HTTP ${res.status} (expected ${status}): ${JSON.stringify(res.data).slice(0, 200)}`);
  }
  return `HTTP ${res.status}${res.data.error ? ` - ${res.data.error}` : ""}`;
}

const anonymous = new Client();
const customer = new Client();
const staff = new Client();
const admin = new Client();

// ---- Authentication -------------------------------------------------
await check("Auth", "API rejects requests without a session", "401", async () =>
  expectStatus(await anonymous.request("GET", "/api/returns"), 401));

await check("Auth", "Wrong password is rejected", "401", async () =>
  expectStatus(await anonymous.login("rahul", "wrong-password"), 401));

await check("Auth", "Customer can log in", "200 + session cookie", async () => {
  const res = await customer.login("rahul", "customer123");
  expectStatus(res, 200);
  if (!customer.cookie.startsWith("rl_session=")) throw new Error("no session cookie");
  return `HTTP 200, role ${res.data.user.role}`;
});

await check("Auth", "Tampered session cookie is rejected", "401", async () => {
  const forged = new Client();
  const [payload, signature] = customer.cookie.replace("rl_session=", "").split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  claims.role = "Admin";
  forged.cookie = `rl_session=${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
  return expectStatus(await forged.request("GET", "/api/analytics"), 401);
});

await staff.login("staff", "staff123");
await admin.login("admin", "admin123");

// ---- Authorization ----------------------------------------------------
await check("Authorization", "Customer cannot open analytics", "403", async () =>
  expectStatus(await customer.request("GET", "/api/analytics"), 403));

await check("Authorization", "Customer sees only their own returns", "all rows CustomerID 1", async () => {
  const res = await customer.request("GET", "/api/returns");
  expectStatus(res, 200);
  const others = res.data.returns.filter((r) => r.CustomerID !== 1);
  if (others.length > 0) throw new Error(`saw ${others.length} returns of other customers`);
  return `${res.data.returns.length} returns, all own`;
});

await check("Authorization", "Customer cannot read another customer's return", "404", async () =>
  expectStatus(await customer.request("GET", "/api/returns/1"), 404));

await check("Authorization", "Customer cannot return another customer's item", "422 (stored procedure)", async () =>
  expectStatus(await customer.request("POST", "/api/returns", { orderItemId: 16, reasonId: 1, quantity: 1 }), 422));

await check("Authorization", "Staff cannot create user accounts", "403", async () =>
  expectStatus(await staff.request("POST", "/api/users", { username: "x", password: "secret1", role: "Staff" }), 403));

await check("Authorization", "Staff can open analytics (SQL + MongoDB)", "200 with sql and mongo sections", async () => {
  const res = await staff.request("GET", "/api/analytics");
  expectStatus(res, 200);
  if (!res.data.sql?.kpis || !res.data.mongo?.defectsByCategory) throw new Error("missing sections");
  return `HTTP 200, ${res.data.sql.returnsByStatus.length} status groups, ${res.data.mongo.defectsByCategory.length} defect groups`;
});

// ---- Database errors surfaced through the API --------------------------
await check("Validation", "Invalid email is rejected by the CHECK constraint", "400 chk_customer_email", async () => {
  const res = await admin.request("POST", "/api/customers", { name: "Bad", email: "nope" });
  expectStatus(res, 400);
  if (res.data.constraint !== "chk_customer_email") throw new Error(JSON.stringify(res.data));
  return `HTTP 400 - ${res.data.error}`;
});

await check("Validation", "Deleting a customer with orders is refused (FK)", "409", async () =>
  expectStatus(await admin.request("DELETE", "/api/customers/1"), 409));

await check("Validation", "Invalid workflow step is refused by the trigger", "422", async () =>
  expectStatus(await staff.request("PATCH", "/api/returns/1", { action: "approve" }), 422));

await check("Validation", "Duplicate SKU is refused", "409", async () =>
  expectStatus(await admin.request("POST", "/api/products", { productName: "Copy", sku: "ELEC101", unitPrice: 10, categoryId: 1 }), 409));

// ---- Registration -------------------------------------------------------
await check("Auth", "New customer can register (CUSTOMER + APP_USER in one transaction)", "201", async () => {
  const newbie = new Client();
  return expectStatus(await newbie.request("POST", "/api/auth/register", {
    name: "Test Customer", email: `test-${run}@example.com`, phone: "9123456780",
    address: "1 Test Street", username: `test_${run}`, password: "secret123",
  }), 201);
});

await check("Auth", "Duplicate username rolls back the customer row too", "409, no orphan customer", async () => {
  const newbie = new Client();
  const res = await newbie.request("POST", "/api/auth/register", {
    name: "Dup", email: `dup-${run}@example.com`, username: `test_${run}`, password: "secret123",
  });
  expectStatus(res, 409);
  const list = await admin.request("GET", `/api/customers?q=dup-${run}`);
  if (list.data.customers.length !== 0) throw new Error("orphan CUSTOMER row left behind");
  return `HTTP 409, no orphan row`;
});

// ---- Full lifecycle ---------------------------------------------------
let orderId, orderItemId, returnId, pickupId;

await check("Workflow", "Customer places an order (transaction, price from DB)", "201, total 2 x 1800 = 3600", async () => {
  const res = await customer.request("POST", "/api/orders", {
    customerId: 2, // ignored for customers
    paymentMethod: "UPI",
    items: [{ productId: 4, quantity: 2 }],
  });
  expectStatus(res, 201);
  orderId = res.data.orderId;
  if (res.data.totalAmount !== 3600) throw new Error(`total ${res.data.totalAmount}`);
  const detail = await customer.request("GET", `/api/orders/${orderId}`);
  expectStatus(detail, 200);
  if (detail.data.order[0].CustomerID !== 1) throw new Error("order not owned by the customer");
  orderItemId = detail.data.order[0].OrderItemID;
  return `order ${orderId}, total ${res.data.totalAmount}`;
});

await check("Workflow", "Return on an undelivered order is refused", "422", async () =>
  expectStatus(await customer.request("POST", "/api/returns", { orderItemId, reasonId: 3, quantity: 1 }), 422));

await check("Workflow", "Staff marks the order delivered", "200", async () =>
  expectStatus(await staff.request("PATCH", `/api/orders/${orderId}`, { status: "Delivered" }), 200));

await check("Workflow", "Customer requests a return (stored procedure)", "201", async () => {
  const res = await customer.request("POST", "/api/returns", {
    orderItemId, reasonId: 3, quantity: 1, comments: "Speaker produces a loud buzzing noise",
  });
  expectStatus(res, 201);
  returnId = res.data.returnId;
  return `return ${returnId}`;
});

await check("Workflow", "Staff approves the return", "200", async () =>
  expectStatus(await staff.request("PATCH", `/api/returns/${returnId}`, { action: "approve" }), 200));

await check("Workflow", "Staff schedules the pickup", "201", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await staff.request("POST", "/api/pickups", { returnId, courierId: 1, pickupDate: today });
  expectStatus(res, 201);
  pickupId = res.data.pickupId;
  return `pickup ${pickupId}`;
});

await check("Workflow", "Inspection before pickup is refused", "422", async () =>
  expectStatus(await staff.request("POST", "/api/inspections", {
    returnId, condition: "Good", conditionScore: 8, disposition: "Restock", warehouseId: 1,
    checklist: [{ item: "Powers on", passed: true }],
  }), 422));

await check("Workflow", "Courier pickup is confirmed", "200", async () =>
  expectStatus(await staff.request("PATCH", `/api/pickups/${pickupId}`, { status: "Picked Up" }), 200));

await check("Workflow", "Invalid MongoDB report rolls back the SQL inspection", "400, return still Picked Up", async () => {
  const res = await staff.request("POST", "/api/inspections", {
    returnId, condition: "Defective", conditionScore: 42, disposition: "Refurbish", warehouseId: 3,
    checklist: [{ item: "Powers on", passed: true }],
  });
  expectStatus(res, 400);
  const detail = await staff.request("GET", `/api/returns/${returnId}`);
  if (detail.data.pipeline.ReturnStatus !== "Picked Up" || detail.data.pipeline.InspectionID) {
    throw new Error("SQL inspection was not rolled back");
  }
  return `HTTP 400 - ${res.data.error}`;
});

await check("Workflow", "Inspection is recorded in MySQL and MongoDB", "201, report stored", async () => {
  const res = await staff.request("POST", "/api/inspections", {
    returnId, condition: "Defective", conditionScore: 4, disposition: "Refurbish", warehouseId: 3,
    detail: "Replace speaker driver", remarks: "Buzzing at all volume levels",
    notes: "Driver coil damaged, casing fine.",
    checklist: [{ item: "Powers on", passed: true }, { item: "No physical damage", passed: false, note: "coil" }],
    defects: [{ type: "audio distortion", severity: "major", location: "driver" }],
    attributes: { batteryHealthPct: 90 },
  });
  expectStatus(res, 201);
  const detail = await staff.request("GET", `/api/returns/${returnId}`);
  if (!detail.data.report || detail.data.report.inspectionId !== res.data.inspectionId) throw new Error("no MongoDB report");
  return `inspection ${res.data.inspectionId}, status ${detail.data.pipeline.ReturnStatus}`;
});

await check("Workflow", "Refund is processed by sp_process_refund", "201, amount 1800 (seller fault)", async () => {
  const res = await staff.request("POST", "/api/refunds", { pickupId, method: "UPI" });
  expectStatus(res, 201);
  if (res.data.amount !== 1800) throw new Error(`amount ${res.data.amount}`);
  return `refund ${res.data.refundId}, amount ${res.data.amount}`;
});

await check("Workflow", "Second refund for the same pickup is refused", "422", async () =>
  expectStatus(await staff.request("POST", "/api/refunds", { pickupId, method: "UPI" }), 422));

await check("Workflow", "Customer sees the full history and activity feed", "Refunded, 6 history rows (Requested to Refunded), events in MongoDB", async () => {
  const res = await customer.request("GET", `/api/returns/${returnId}`);
  expectStatus(res, 200);
  const { pipeline, history, events } = res.data;
  if (pipeline.ReturnStatus !== "Refunded") throw new Error(`status ${pipeline.ReturnStatus}`);
  if (history.length !== 6) throw new Error(`${history.length} history rows`);
  return `status ${pipeline.ReturnStatus}, ${history.length} history rows, ${events.length} events`;
});

await check("Search", "Cross-database search finds the new inspection", "MySQL and MongoDB hits", async () => {
  const res = await staff.request("GET", "/api/search?q=buzzing");
  expectStatus(res, 200);
  if (res.data.returns.length === 0 || res.data.inspections.length === 0) throw new Error("no MySQL hits");
  const mongo = await staff.request("GET", "/api/search?q=coil");
  if (mongo.data.reports.length === 0) throw new Error("no MongoDB hits");
  return `${res.data.returns.length} return, ${res.data.inspections.length} inspection, ${mongo.data.reports.length} report hits`;
});

// ---- Report -------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
console.table(results.map((r, i) => ({ "#": i + 1, area: r.area, test: r.name, result: r.pass ? "PASS" : "FAIL" })));
for (const r of results.filter((r) => !r.pass)) console.error(`FAIL: ${r.name}\n  ${r.detail}`);
console.log(`\n${passed} / ${results.length} API tests passed.`);

const escape = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync(
  "docs/api-test-results.md",
  [
    "# API test results",
    "",
    `Generated by \`npm run test:api\` on ${new Date().toISOString().slice(0, 10)}: **${passed} / ${results.length} passed**.`,
    "",
    "| # | Area | Test case | Expected | Actual | Result |",
    "|---|------|-----------|----------|--------|--------|",
    ...results.map((r, i) =>
      `| ${i + 1} | ${r.area} | ${escape(r.name)} | ${escape(r.expected)} | ${escape(r.detail)} | ${r.pass ? "PASS" : "FAIL"} |`
    ),
    "",
  ].join("\n")
);
console.log("Report written to docs/api-test-results.md");
process.exit(passed === results.length ? 0 : 1);
