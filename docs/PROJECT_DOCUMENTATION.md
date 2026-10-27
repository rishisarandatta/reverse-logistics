# Reverse Logistics Management System — Project Documentation

DBMS Experiential Learning – Level 3 Project

---

## 1. Objectives

Online retailers receive a steady stream of returned products. Each return has to be approved, collected by a courier, inspected, routed to the right outcome (restock, refurbish, dispose or reject) and, where appropriate, refunded — with the refund amount depending on why the item came back and what condition it is in.

The objectives of the system are to:

1. Manage the complete reverse-logistics pipeline: return request → approval → courier pickup → inspection → disposition → refund.
2. Guarantee data integrity in the database itself: a return can never skip a step, be refunded twice, be refunded for more than it is worth, or receive two dispositions.
3. Recover value from returns by tracking restocked inventory per warehouse.
4. Capture rich, category-specific inspection data (checklists, measurements, defects, photos) that does not fit a fixed relational schema.
5. Give staff and administrators analytics on return rates, reasons, courier performance and product defects.
6. Provide role-based access for Admin, Staff and Customer users.

## 2. Functional requirements

| # | Requirement | Roles |
|---|-------------|-------|
| F1 | Log in / log out; customers can self-register | All |
| F2 | Place orders containing one or more products; prices come from the catalogue | Customer (own), Staff/Admin (any customer) |
| F3 | Request a return for a delivered item within 30 days, choosing quantity and reason | Customer (own items), Staff |
| F4 | Approve or reject return requests | Staff, Admin |
| F5 | Schedule, confirm, fail and reschedule courier pickups | Staff, Admin |
| F6 | Record an inspection with a category-specific checklist, defects and attributes, and choose a disposition | Staff, Admin |
| F7 | Issue refunds calculated by the refund policy | Staff, Admin |
| F8 | Track a return end-to-end: pipeline status, audit history and activity feed; post messages | Customer (own), Staff, Admin |
| F9 | Search return comments, inspection remarks, products and inspection reports | Staff, Admin |
| F10 | Dashboard with return analytics and inspection insights | Staff, Admin |
| F11 | Manage customers and products (create, list, filter, delete) | Admin (write), Staff (read) |
| F12 | Manage user accounts (create staff, activate / deactivate) | Admin |

## 3. System architecture

```mermaid
flowchart LR
    subgraph Browser
        UI["Next.js pages<br/>(React server + client components)"]
    end

    subgraph "Next.js server"
        PX["proxy.ts<br/>redirects visitors without a session"]
        API["Route handlers /app/api/*<br/>authentication + role checks"]
        DAL["Data-access layer /lib<br/>db.ts · mongo.ts · data/*"]
    end

    MY[("MySQL 8<br/>ReverseLogisticsDB<br/>tables · views · triggers · procedures")]
    MG[("MongoDB<br/>reverse_logistics<br/>inspection_reports · return_events")]

    UI -- "fetch (JSON)" --> API
    UI -. "server render" .-> DAL
    PX --> UI
    API --> DAL
    DAL -- "mysql2 pool" --> MY
    DAL -- "MongoDB driver" --> MG
```

* **Presentation** — Next.js App Router pages. Server components read data through the data-access layer; client components (forms, buttons) call the REST API.
* **API layer** — Route handlers under `app/api`. Every handler checks the session and role (`lib/auth.ts`) and converts database errors into readable JSON responses (`lib/http.ts`).
* **Data-access layer** — `lib/db.ts` (MySQL connection pool, transaction helper), `lib/mongo.ts` (MongoDB client) and `lib/data/*` (all SQL queries and aggregation pipelines).
* **Configuration** — all credentials come from environment variables in `.env.local` (template: `.env.example`); nothing is hard-coded.

## 4. Database choice and justification

| Data | Store | Why |
|------|-------|-----|
| Customers, products, orders, order items | MySQL | Highly structured, related by foreign keys, needs joins and aggregation. |
| Returns, pickups, inspections (summary), dispositions, refunds | MySQL | Money and workflow state: needs ACID transactions, row locking, foreign keys, CHECK constraints and triggers so the rules cannot be bypassed. |
| Users and roles | MySQL | Small, structured, must be consistent with customer records (FK + CHECK). |
| Detailed inspection reports | MongoDB | Shape differs per product category: electronics record battery health and serial numbers, clothing records tags and stains, footwear records sole wear. Checklists, defects and photos are nested arrays of variable length. A document per report stores this naturally, without dozens of nullable columns or EAV tables. |
| Return activity feed | MongoDB | Append-only events whose payload differs per event type (courier scan, customer message, refund, staff note). Read as one timeline per return. |

The two stores are linked by keys: every `inspection_reports` document carries the SQL `InspectionID` and `ReturnID`; every `return_events` document carries the `ReturnID`. MySQL remains the **system of record** for anything that affects money or workflow state; MongoDB holds the descriptive detail.

## 5. ER diagram

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDERS : places
    CUSTOMER |o--o| APP_USER : "logs in as"
    CATEGORY ||--o{ PRODUCT : groups
    ORDERS ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "ordered as"
    ORDER_ITEM ||--o{ RETURNS : "returned via"
    ORDERS ||--o{ RETURNS : "belongs to"
    RETURN_REASON ||--o{ RETURNS : explains
    RETURNS ||--o| PICKUP : "collected by"
    COURIER ||--o{ PICKUP : performs
    PICKUP ||--o| REFUND : "settled by"
    RETURNS ||--o| INSPECTION : "inspected in"
    APP_USER |o--o{ INSPECTION : inspects
    INSPECTION ||--o| RESTOCK : "may become"
    INSPECTION ||--o| REFURBISH : "may become"
    INSPECTION ||--o| DISPOSE : "may become"
    INSPECTION ||--o| REJECT : "may become"
    WAREHOUSE ||--o{ RESTOCK : receives
    WAREHOUSE ||--o{ REFURBISH : receives
    WAREHOUSE ||--o{ DISPOSE : receives
    PRODUCT ||--o{ INVENTORY : stocked
    WAREHOUSE ||--o{ INVENTORY : holds
    RETURNS ||--o{ RETURN_STATUS_HISTORY : "audited in"
    APP_USER |o--o{ RETURN_STATUS_HISTORY : "changed by"

    CUSTOMER { int CustomerID PK  string Name  string Email UK  string Phone  string Address  string CustomerType }
    CATEGORY { int CategoryID PK  string CategoryName UK }
    PRODUCT { int ProductID PK  string ProductName  string SKU UK  decimal UnitPrice  int CategoryID FK }
    ORDERS { int OrderID PK  date OrderDate  decimal TotalAmount  string PaymentMethod  string OrderStatus  int CustomerID FK }
    ORDER_ITEM { int OrderItemID PK  int Quantity  decimal UnitPrice  int OrderID FK  int ProductID FK }
    RETURN_REASON { int ReturnReasonID PK  string ReasonName UK  string Description  bool IsSellerFault }
    RETURNS { int ReturnID PK  int OrderItemID FK  date ReturnDate  int ReturnQty  int ReturnReasonID FK  string ReturnStatus  string Comments  int OrderID FK }
    COURIER { int CourierID PK  string CourierName  string Phone  string Email }
    PICKUP { int PickupID PK  int ReturnID FK  date PickupDate  string PickupAddress  string PickupStatus  int CourierID FK }
    APP_USER { int UserID PK  string Username UK  string PasswordHash  string Role  int CustomerID FK  bool IsActive }
    INSPECTION { int InspectionID PK  date InspectionDate  string ProductCondition  string Remarks  int ReturnID FK  int InspectorID FK }
    REFUND { int RefundID PK  int PickupID FK  date RefundDate  decimal RefundAmount  string RefundMethod  string RefundStatus }
    WAREHOUSE { int WarehouseID PK  string WarehouseName  string Location }
    RESTOCK { int RestockID PK  int InspectionID FK  date RestockDate  int NewStockQty  int WarehouseID FK }
    REFURBISH { int RefurbishID PK  int InspectionID FK  date RefurbishDate  string Details  int WarehouseID FK }
    DISPOSE { int DisposeID PK  int InspectionID FK  date DisposeDate  string Reason  string DisposalMethod  int WarehouseID FK }
    REJECT { int RejectID PK  int InspectionID FK  date RejectDate  string Reason }
    INVENTORY { int ProductID PK  int WarehouseID PK  int Quantity }
    RETURN_STATUS_HISTORY { int HistoryID PK  int ReturnID FK  string OldStatus  string NewStatus  int ChangedBy FK  timestamp ChangedAt }
```

## 6. Relational schema

Primary keys are <u>underlined</u>; foreign keys are marked with `→`.

```
CUSTOMER(CustomerID, Name, Email, Phone, Address, CustomerType)
CATEGORY(CategoryID, CategoryName)
PRODUCT(ProductID, ProductName, SKU, UnitPrice, CategoryID → CATEGORY)
ORDERS(OrderID, OrderDate, TotalAmount, PaymentMethod, OrderStatus, CustomerID → CUSTOMER)
ORDER_ITEM(OrderItemID, Quantity, UnitPrice, OrderID → ORDERS, ProductID → PRODUCT)
RETURN_REASON(ReturnReasonID, ReasonName, Description, IsSellerFault)
RETURNS(ReturnID, OrderItemID, ReturnDate, ReturnQty, ReturnReasonID → RETURN_REASON,
        ReturnStatus, Comments, OrderID → ORDERS, (OrderItemID, OrderID) → ORDER_ITEM)
COURIER(CourierID, CourierName, Phone, Email)
PICKUP(PickupID, ReturnID → RETURNS [unique], PickupDate, PickupAddress, PickupStatus, CourierID → COURIER)
APP_USER(UserID, Username, PasswordHash, Role, CustomerID → CUSTOMER [unique, nullable], IsActive, CreatedAt)
INSPECTION(InspectionID, InspectionDate, ProductCondition, Remarks, ReturnID → RETURNS [unique], InspectorID → APP_USER)
REFUND(RefundID, PickupID → PICKUP [unique], RefundDate, RefundAmount, RefundMethod, RefundStatus)
WAREHOUSE(WarehouseID, WarehouseName, Location)
RESTOCK(RestockID, InspectionID → INSPECTION [unique], RestockDate, NewStockQty, WarehouseID → WAREHOUSE)
REFURBISH(RefurbishID, InspectionID → INSPECTION [unique], RefurbishDate, Details, WarehouseID → WAREHOUSE)
DISPOSE(DisposeID, InspectionID → INSPECTION [unique], DisposeDate, Reason, DisposalMethod, WarehouseID → WAREHOUSE)
REJECT(RejectID, InspectionID → INSPECTION [unique], RejectDate, Reason)
INVENTORY(ProductID → PRODUCT, WarehouseID → WAREHOUSE, Quantity, UpdatedAt)       PK = (ProductID, WarehouseID)
RETURN_STATUS_HISTORY(HistoryID, ReturnID → RETURNS, OldStatus, NewStatus, ChangedBy → APP_USER, ChangedAt)
```

### Design decisions

* **Normalization.** All tables are in 3NF. `ORDER_ITEM.UnitPrice` intentionally copies the catalogue price at the time of sale (historical fact, not a dependency on `PRODUCT`). `ORDERS.TotalAmount` is derived data kept consistent by triggers.
* **`RETURNS.OrderID`** is redundant with `OrderItemID` (kept from the original ER design for convenient querying). To prevent an inconsistent value, a composite foreign key `(OrderItemID, OrderID) → ORDER_ITEM(OrderItemID, OrderID)` is enforced, and a trigger always derives `OrderID` from the order item.
* **1 : 1 relationships** (return–pickup, return–inspection, pickup–refund, inspection–disposition) are implemented with `UNIQUE` foreign keys.
* **Disposition as four tables** (from the original design) is a disjoint specialization of "inspection outcome". Disjointness across tables cannot be expressed declaratively, so a shared procedure `sp_assert_no_disposition` is called by a trigger on each table.
* **Surrogate keys** use `AUTO_INCREMENT`, so the application never computes `MAX(id) + 1`, which is unsafe under concurrency.

## 7. Data dictionary

### CUSTOMER
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| CustomerID | INT | PK, AUTO_INCREMENT | Customer identifier |
| Name | VARCHAR(100) | NOT NULL | Full name |
| Email | VARCHAR(100) | NOT NULL, UNIQUE, CHECK format | Contact email |
| Phone | VARCHAR(20) | CHECK 10-digit Indian mobile | Contact number |
| Address | VARCHAR(255) | | Default pickup address |
| CustomerType | VARCHAR(30) | NOT NULL, DEFAULT 'Regular', CHECK IN (Regular, Premium) | Loyalty tier |

### CATEGORY
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| CategoryID | INT | PK | Category identifier |
| CategoryName | VARCHAR(100) | NOT NULL, UNIQUE | e.g. Electronics; also selects the inspection checklist |

### PRODUCT
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ProductID | INT | PK | Product identifier |
| ProductName | VARCHAR(150) | NOT NULL, FULLTEXT | Display name |
| SKU | VARCHAR(50) | NOT NULL, UNIQUE | Stock-keeping unit |
| UnitPrice | DECIMAL(10,2) | NOT NULL, CHECK ≥ 0 | Current selling price |
| CategoryID | INT | NOT NULL, FK → CATEGORY | Category |

### ORDERS
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OrderID | INT | PK | Order identifier |
| OrderDate | DATE | NOT NULL | Start of the 30-day return window |
| TotalAmount | DECIMAL(10,2) | NOT NULL, CHECK ≥ 0, trigger-maintained | Sum of order lines |
| PaymentMethod | VARCHAR(50) | CHECK IN (Cash, UPI, Card, NetBanking) | |
| OrderStatus | VARCHAR(50) | CHECK IN (Placed, Shipped, Delivered, Cancelled) | Only Delivered orders can be returned |
| CustomerID | INT | NOT NULL, FK → CUSTOMER | Buyer |

### ORDER_ITEM
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| OrderItemID | INT | PK; UNIQUE(OrderItemID, OrderID) | Line identifier |
| Quantity | INT | NOT NULL, CHECK > 0 | Units ordered |
| UnitPrice | DECIMAL(10,2) | NOT NULL, CHECK ≥ 0 | Price at time of sale |
| OrderID | INT | FK → ORDERS ON DELETE CASCADE | |
| ProductID | INT | FK → PRODUCT | |

### RETURN_REASON
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ReturnReasonID | INT | PK | |
| ReasonName | VARCHAR(100) | NOT NULL, UNIQUE | e.g. Damaged Product |
| Description | VARCHAR(255) | | |
| IsSellerFault | BOOLEAN | NOT NULL | TRUE → full refund regardless of condition |

### RETURNS
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ReturnID | INT | PK | Return identifier |
| OrderItemID | INT | NOT NULL, FK (composite) | Item being returned |
| ReturnDate | DATE | NOT NULL, DEFAULT CURRENT_DATE, trigger: within 30 days | |
| ReturnQty | INT | NOT NULL, CHECK > 0, trigger: ≤ unreturned quantity | |
| ReturnReasonID | INT | NOT NULL, FK → RETURN_REASON | |
| ReturnStatus | VARCHAR(50) | CHECK IN (8 statuses), trigger state machine | Workflow status |
| Comments | VARCHAR(500) | FULLTEXT | Customer's description |
| OrderID | INT | NOT NULL, FK, derived by trigger | |

### PICKUP
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| PickupID | INT | PK | |
| ReturnID | INT | NOT NULL, UNIQUE, FK → RETURNS | One pickup per return |
| PickupDate | DATE | NOT NULL, trigger: ≥ ReturnDate | |
| PickupAddress | VARCHAR(255) | NOT NULL | Defaults to customer address |
| PickupStatus | VARCHAR(50) | CHECK IN (Scheduled, Picked Up, Failed, Cancelled), trigger transitions | |
| CourierID | INT | NOT NULL, FK → COURIER | |

### APP_USER
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| UserID | INT | PK | |
| Username | VARCHAR(50) | NOT NULL, UNIQUE, CHECK length ≥ 3 | |
| PasswordHash | VARCHAR(255) | NOT NULL | `scrypt$salt$hash` |
| Role | VARCHAR(20) | CHECK IN (Admin, Staff, Customer) | |
| CustomerID | INT | UNIQUE, FK → CUSTOMER; CHECK set iff Role = Customer | Link for customer logins |
| IsActive | BOOLEAN | NOT NULL DEFAULT TRUE | Deactivated users cannot log in |
| CreatedAt | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

### INSPECTION
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| InspectionID | INT | PK | Also the key of the MongoDB report |
| InspectionDate | DATE | NOT NULL, trigger: ≥ PickupDate | |
| ProductCondition | VARCHAR(100) | CHECK IN (Like New, Good, Fair, Damaged, Defective) | Drives the refund percentage |
| Remarks | VARCHAR(500) | FULLTEXT | Summary remarks |
| ReturnID | INT | NOT NULL, UNIQUE, FK → RETURNS; trigger: pickup completed | |
| InspectorID | INT | FK → APP_USER | |

### REFUND
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| RefundID | INT | PK | |
| PickupID | INT | NOT NULL, UNIQUE, FK → PICKUP | One refund per pickup |
| RefundDate | DATE | NOT NULL | |
| RefundAmount | DECIMAL(10,2) | CHECK ≥ 0, trigger: ≤ item value | From `fn_calculate_refund` |
| RefundMethod | VARCHAR(50) | CHECK IN (Original Payment, UPI, Bank Transfer, Store Credit) | |
| RefundStatus | VARCHAR(50) | CHECK IN (Pending, Processed, Failed); Processed is immutable | |

### WAREHOUSE, COURIER
Reference tables: `WarehouseID / CourierID` (PK), name (NOT NULL), location / contact details.

### RESTOCK, REFURBISH, DISPOSE, REJECT
Each has its own PK, `InspectionID` (NOT NULL, UNIQUE, FK → INSPECTION, trigger: no other disposition) and a date. RESTOCK adds `NewStockQty` (CHECK > 0, ≤ returned quantity) and `WarehouseID`; REFURBISH adds `Details`, `WarehouseID`; DISPOSE adds `Reason`, `DisposalMethod` (CHECK IN Recycle, E-Waste, Landfill, Donate), `WarehouseID`; REJECT adds `Reason`.

### INVENTORY
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ProductID | INT | PK (composite), FK → PRODUCT | |
| WarehouseID | INT | PK (composite), FK → WAREHOUSE | |
| Quantity | INT | CHECK ≥ 0 | Units recovered through restocking (maintained by trigger) |
| UpdatedAt | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

### RETURN_STATUS_HISTORY
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| HistoryID | INT | PK | |
| ReturnID | INT | FK → RETURNS | |
| OldStatus / NewStatus | VARCHAR(50) | | Transition recorded |
| ChangedBy | INT | FK → APP_USER | From session variable `@app_user_id` |
| ChangedAt | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

## 8. SQL implementation

Scripts live in [`database/`](../database) and run in order (`npm run db:setup`):

| File | Contents | DDL / DML |
|------|----------|-----------|
| `00_reset.sql` | `DROP DATABASE` | DROP |
| `01_schema.sql` | 19 tables, PKs, FKs, UNIQUE, NOT NULL, defaults | CREATE |
| `02_constraints_indexes.sql` | 22 CHECK constraints, UNIQUE SKU, secondary + FULLTEXT indexes | ALTER, CREATE INDEX |
| `03_functions_procedures.sql` | 2 functions, 5 procedures | DROP / CREATE |
| `04_triggers.sql` | 23 triggers | DROP / CREATE |
| `05_views.sql` | 6 views | DROP / CREATE VIEW |
| `06_seed.sql` | Sample data that passes every rule | INSERT, UPDATE |
| `07_queries.sql` | Demonstration queries (not run by setup) | SELECT, DML, transactions, ALTER / DROP |

### 8.1 Advanced features

| Feature | Where | Purpose |
|---------|-------|---------|
| **Transactions** | `withTransaction()` in `lib/db.ts` — order placement, return registration, customer registration, customer delete, pickup scheduling; `sp_process_refund` (START TRANSACTION / COMMIT / EXIT HANDLER ROLLBACK); inspection spanning MySQL + MongoDB | All-or-nothing multi-row operations |
| **Row locking** | `SELECT … FOR UPDATE` in `sp_process_refund` and pickup update | Prevents two staff refunding / updating the same return concurrently |
| **Stored functions** | `fn_calculate_refund`, `fn_is_valid_return_transition` | Refund policy and workflow rules in one place |
| **Stored procedures** | `sp_register_return`, `sp_complete_inspection`, `sp_process_refund`, `sp_assert_no_disposition`, `GetCustomerOrders` | Encapsulated business operations |
| **Triggers** | 23 triggers in `04_triggers.sql` | Cross-table validation, state machine, audit trail, derived totals, inventory |
| **Views** | `OrderDetailsView`, `ReturnPipelineView`, `PendingActionsView`, `ProductReturnStatsView`, `CustomerReturnSummaryView`, `WarehouseDispositionView` | Reusable joins / aggregates used by the API and dashboard |
| **Indexes** | Composite `idx_orders_customer_date`, status / date indexes, `idx_history_return_time` | Fast filters, order history, timelines (verified with `EXPLAIN`) |
| **Full-text search** | FULLTEXT on `RETURNS.Comments`, `INSPECTION.Remarks`, `PRODUCT.ProductName`; BOOLEAN MODE prefix queries | Search box on Returns, Products and Search pages |

### 8.2 Return workflow (enforced by triggers)

```mermaid
stateDiagram-v2
    [*] --> Requested : sp_register_return (window, qty, delivered checks)
    Requested --> Approved : staff
    Requested --> Rejected : staff
    Approved --> Rejected : staff
    Approved --> PickupScheduled : INSERT PICKUP
    PickupScheduled --> PickedUp : pickup Picked Up
    PickupScheduled --> Approved : pickup Failed / Cancelled
    PickedUp --> Inspected : INSERT INSPECTION
    Inspected --> Refunded : REFUND Processed
    Inspected --> Closed : INSERT REJECT
    Refunded --> Closed
```

Any other transition raises `SIGNAL SQLSTATE '45000'` with a readable message, which the API returns as HTTP 422 and the UI displays.

### 8.3 Refund policy (`fn_calculate_refund`)

| Situation | Refund |
|-----------|--------|
| Seller fault (Damaged, Wrong, Defective product) | 100 % of `ReturnQty × UnitPrice` |
| Otherwise, condition Like New / Good / Fair / Damaged / Defective | 100 % / 90 % / 70 % / 40 % / 40 % |
| Rejected at inspection | 0 |

## 9. NoSQL (MongoDB) implementation

Database `reverse_logistics`, created by `scripts/mongo-setup.mjs` (`npm run mongo:setup`).

### 9.1 `inspection_reports`

One document per SQL inspection. Sample:

```json
{
  "inspectionId": 6,
  "returnId": 6,
  "productId": 4,
  "productName": "Bluetooth Speaker",
  "category": "Electronics",
  "inspector": { "userId": 2, "username": "staff" },
  "inspectedAt": "2026-09-29T10:00:00Z",
  "conditionGrade": "Defective",
  "conditionScore": 5,
  "disposition": "Refurbish",
  "checklist": [
    { "item": "Powers on", "passed": true },
    { "item": "Battery holds charge", "passed": false, "note": "Battery holds about 40 percent" }
  ],
  "attributes": { "serialNumber": "BTS-1802-K3", "batteryHealthPct": 40, "factoryResetDone": true },
  "defects": [
    { "type": "audio distortion", "severity": "major", "location": "speaker driver" },
    { "type": "battery degradation", "severity": "major", "location": "battery" }
  ],
  "photos": [{ "fileName": "inspection-6-front.jpg", "caption": "Front view" }],
  "notes": "Speaker driver distorts above 70 percent volume and the battery is degraded..."
}
```

* **Validation** — `$jsonSchema` validator (`validationAction: error`): required fields, `conditionScore` 1–10, enumerations for category, condition, disposition and defect severity, typed nested arrays.
* **Indexes** — unique `{inspectionId}`; `{returnId}`; `{category, inspectedAt}`; multikey `{defects.type}`; weighted text index over `notes` (5), `defects.type` (3), `checklist.note` (1).
* **Checklist templates** — `lib/inspection-checklists.json` defines the checklist and attribute names per category; the same file drives the UI form and the seed script.

### 9.2 `return_events`

```json
{ "returnId": 14, "type": "PICKUP_SCAN", "at": "2026-10-23T11:15:00Z",
  "actor": { "userId": null, "username": "QuickShip Logistics", "role": "Courier" },
  "message": "Pickup attempt failed",
  "data": { "attempt": 1, "failureReason": "Customer not available at address" } }
```

* Event types: `REQUEST_CREATED`, `STATUS_CHANGED`, `PICKUP_SCHEDULED`, `PICKUP_SCAN`, `INSPECTION_COMPLETED`, `REFUND_ISSUED`, `CUSTOMER_MESSAGE`, `STAFF_NOTE` — each with its own `data` shape.
* Validator requires `returnId`, `type` (enum), `at`, `actor.role` (enum).
* Indexes: `{returnId, at}` (timeline of one return), `{type, at}`.

### 9.3 Retrieval strategy

| Need | Query |
|------|-------|
| Report for a return | `findOne({ returnId })` using `idx_return_id` |
| Timeline of a return | `find({ returnId }).sort({ at: 1 })` using `idx_return_timeline` |
| Search inspector notes | `find({ $text: { $search } })` sorted by `textScore` |
| Most frequent defects | `$unwind defects → $group {category, type} → $sort → $limit` |
| Condition by category | `$group { _id: category, avgScore: $avg, dispositions: $push }` |
| Failing checklist items | `$unwind checklist → $group with $sum: $cond(passed = false) → $match → $project rate` |
| Activity volume | `$group by type with $max(at)` |

### 9.4 Consistency across the two databases

The inspection endpoint (`app/api/inspections/route.ts`) writes both stores atomically:

1. `BEGIN` a MySQL transaction and `CALL sp_complete_inspection` (inspection + disposition rows, triggers run).
2. Insert the MongoDB report (schema validator runs).
3. `COMMIT` MySQL.

If step 1 or 2 fails, MySQL rolls back. If the commit fails after the Mongo insert, the Mongo document is deleted (compensating action). The API test "Invalid MongoDB report rolls back the SQL inspection" verifies this. Activity-feed events are written after the SQL commit on a best-effort basis: MySQL is the system of record, so a MongoDB outage never blocks a workflow step.

## 10. Important queries

All are in [`database/07_queries.sql`](../database/07_queries.sql) and in `lib/data/analytics.ts` (dashboard). Highlights:

* **5-table INNER JOIN** — every return with customer, product, category, reason.
* **LEFT JOIN + GROUP BY** — returns per customer including customers with none.
* **JOIN + derived table + GROUP BY + HAVING** — return rate per category.
* **HAVING COUNT(*) ≥ 2** — repeat returners.
* **Subquery against an aggregate** — products with an above-average return rate.
* **Correlated subquery** — each customer's most expensive order.
* **NOT EXISTS** — products never returned.
* **Conditional aggregation** — courier completed vs failed pickups; monthly refunds.
* **UNION ALL in a view** — disposition counts per warehouse.
* **FULLTEXT MATCH … AGAINST** in BOOLEAN and NATURAL LANGUAGE modes, ranked by score.

## 11. Authentication and authorization

* Passwords are hashed with salted **scrypt** (`lib/auth.ts`); plain passwords are never stored.
* Login issues an **HMAC-SHA256-signed session cookie** (`httpOnly`, `SameSite=Lax`, 8-hour expiry). Changing the role inside the cookie invalidates the signature (tested).
* `proxy.ts` redirects visitors without a session to `/login`; every route handler and page additionally calls `requireApiSession(...roles)` / `requirePageSession(...roles)`.
* Row-level authorization: customers only see their own orders and returns (queries filter by `CustomerID`), and `sp_register_return` refuses items from another customer's order.

| Capability | Admin | Staff | Customer |
|------------|:-----:|:-----:|:--------:|
| Own orders / returns, request returns, post messages | ✓ | ✓ | ✓ |
| All orders / returns, workflow actions, refunds | ✓ | ✓ | |
| Dashboard, search, customer list | ✓ | ✓ | |
| Create / delete customers and products | ✓ | | |
| Manage user accounts | ✓ | | |

## 12. API reference

| Method & path | Roles | Description |
|---------------|-------|-------------|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | — | Session management |
| `POST /api/auth/register` | public | Customer sign-up (transaction) |
| `GET /api/lookups` | any | Categories, reasons, couriers, warehouses |
| `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id` | Staff read, Admin write | Customers (+ `CALL GetCustomerOrders`) |
| `GET/POST /api/products`, `PUT/DELETE /api/products/:id` | any read, Admin write | Products (`?q=` full-text, `?categoryId=`) |
| `GET/POST /api/orders`, `GET/PATCH /api/orders/:id` | any (scoped), Staff status | Orders |
| `GET/POST /api/returns` | any (scoped) | List (`?status=`, `?q=`), request a return |
| `GET/PATCH /api/returns/:id` | any (scoped), Staff approve/reject | Detail from both databases |
| `POST /api/returns/:id/events` | any (scoped) | Message / note into MongoDB |
| `GET/POST /api/pickups`, `PATCH /api/pickups/:id` | Staff | List pickups and returns awaiting a courier, schedule / update a pickup |
| `POST /api/inspections` | Staff | Cross-database inspection |
| `GET/POST /api/refunds` | Staff | Refund queue, process refund |
| `GET /api/analytics` | Staff | SQL reports + MongoDB aggregations |
| `GET /api/search?q=` | Staff | MySQL FULLTEXT + MongoDB `$text` |
| `GET/POST /api/users`, `PATCH /api/users/:id` | Admin | Accounts |

Database errors are mapped to HTTP codes: CHECK violation → 400, missing FK target → 400, duplicate → 409, FK restrict on delete → 409, trigger / procedure `SIGNAL` → 422, MongoDB validation → 400.

## 13. Testing

* `npm run test:db` — 55 database tests (constraints, triggers, functions, procedures, views, indexes, full-text, MongoDB validators / indexes / aggregation). Each MySQL test runs in a rolled-back transaction. Results: [`test-results.md`](test-results.md).
* `npm run test:api` — 32 API tests against the running app: authentication, tampered cookies, role checks, row-level access, error mapping, and one complete lifecycle (order → return → approval → pickup → failed and successful inspection → refund → search). Results: [`api-test-results.md`](api-test-results.md).

## 14. Application screenshots

All screenshots are in [`screenshots/`](screenshots). Screens 07–13 follow **one return (#15)** through the whole workflow.

### Sign-in and customer view

| | |
|---|---|
| **Login** with demo accounts ![](screenshots/01-login.png) | **Customer home**: own returns and what happens next ![](screenshots/02-customer-home.png) |
| **Request a return**: only eligible items, refund rule shown per reason ![](screenshots/03-customer-request-return.png) | **Customer tracking** a new return ![](screenshots/04-customer-return-tracking.png) |

### Staff overview

| | |
|---|---|
| **Staff home**: work queue counts ![](screenshots/05-staff-home.png) | **Returns list**: status filters and full-text search ![](screenshots/06-returns-list.png) |

### Return workflow (return #15)

| | |
|---|---|
| **1. Review**: approve or reject ![](screenshots/07-workflow-1-review-request.png) | **Pickups page**: returns waiting for a courier and all pickups ![](screenshots/08-pickups-page.png) |
| **2. Book a pickup** ![](screenshots/09-workflow-2-book-pickup.png) | **3. Confirm the pickup** ![](screenshots/10-workflow-3-confirm-pickup.png) |
| **4. Inspection**: category checklist, defects, outcome (saved to MySQL + MongoDB) ![](screenshots/11-workflow-4-inspection-form.png) | **5. Refund**: amount from `fn_calculate_refund` ![](screenshots/12-workflow-5-issue-refund.png) |
| **6. Complete**: audit history (MySQL trigger), activity feed and inspection report (MongoDB) ![](screenshots/13-workflow-6-refunded-complete.png) | **Customer home after the refund** ![](screenshots/14-customer-home-after-refund.png) |
| **Failed pickup**: return goes back to Approved and can be rescheduled ![](screenshots/15-failed-pickup-reschedule.png) | **Refunds**: queue and history ![](screenshots/16-refunds.png) |

### Reports, search and records

| | |
|---|---|
| **Analytics**: SQL reports and MongoDB aggregations ![](screenshots/17-analytics-dashboard.png) | **Search**: MySQL FULLTEXT + MongoDB `$text` ![](screenshots/18-search-sql-and-mongodb.png) |
| **Orders** ![](screenshots/19-orders.png) | **New order**: multi-item, transactional ![](screenshots/20-new-order.png) |
| **Products**: return statistics and recovered stock ![](screenshots/21-products.png) | **Customers** ![](screenshots/22-customers.png) |
| **Database validation**: invalid email rejected by `chk_customer_email` ![](screenshots/23-database-validation-error.png) | **User accounts** (Admin) ![](screenshots/24-user-accounts.png) |
| **Phone layout** ![](screenshots/25-mobile-my-returns.png) | |

## 15. Conclusion

The system shows how relational and document databases complement each other in one real workflow. MySQL holds everything that must be correct — orders, money and workflow state — and enforces the business rules itself through constraints, triggers, procedures and transactions, so no client can put the data into an invalid state. MongoDB holds the variable, descriptive side of returns: category-specific inspection reports and a heterogeneous activity feed, which it validates, indexes, searches and aggregates. The Next.js application ties the two together behind an authenticated, role-aware API, including an inspection operation that stays consistent across both databases.
