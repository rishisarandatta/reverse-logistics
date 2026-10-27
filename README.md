# Reverse Logistics Management System

A web application for managing product returns end-to-end — return request, approval, courier pickup, inspection, disposition (restock / refurbish / dispose / reject), refund and inventory recovery — built with **Next.js**, **MySQL** and **MongoDB**.

* **MySQL** stores orders, returns, pickups, refunds and users, and enforces the business rules itself: CHECK constraints, foreign keys, a return-workflow state machine in triggers, stored procedures and functions, transactions, views, indexes and full-text search.
* **MongoDB** stores category-specific inspection reports (checklists, defects, measurements) and a per-return activity feed, with `$jsonSchema` validation, text search and aggregation pipelines.
* **Next.js** provides the UI and the REST API (route handlers) with role-based access for **Admin**, **Staff** and **Customer** users.

Full design documentation (ER diagram, relational schema, data dictionary, NoSQL model, queries, architecture, tests): [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md).

## Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS |
| Backend / API | Next.js Route Handlers, `mysql2`, `mongodb` driver |
| SQL database | MySQL 8.0 (8.0.16+ required for CHECK constraints) |
| NoSQL database | MongoDB 6+ |
| Language | TypeScript |

## Getting started

### 1. Prerequisites

* Node.js 20 or newer
* MySQL 8.0 running locally (or reachable over the network)
* MongoDB running locally (`mongodb://localhost:27017`) or a MongoDB Atlas URI

### 2. Clone and install

```bash
git clone https://github.com/rishisarandatta/reverse-logistics.git
cd reverse-logistics
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your MySQL password, MongoDB URI and a random `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.local` is git-ignored. Never commit real credentials.

### 4. Create and seed the databases

```bash
npm run db:setup      # MySQL: schema, constraints, procedures, triggers, views, sample data
npm run mongo:setup   # MongoDB: collections, validators, indexes, sample reports and events
```

To rebuild from scratch at any time:

```bash
npm run db:reset && npm run mongo:setup
```

(The SQL scripts in [`database/`](database) can also be run manually in MySQL Workbench in the order `01` → `06`.)

### 5. Run the application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with a demo account:

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Staff | `staff` | `staff123` |
| Customer | `rahul` (also `priya`, `amit`) | `customer123` |

New customers can also register from the login page.

### 6. Run the tests

```bash
npm run test:db       # 54 database tests (MySQL + MongoDB), writes docs/test-results.md
npm run dev           # in another terminal, then:
npm run test:api      # 30 API tests, writes docs/api-test-results.md
```

`test:db` leaves the data unchanged (every test is rolled back). `test:api` creates new records; run `npm run db:reset && npm run mongo:setup` afterwards to restore the demo data.

## Project structure

```
app/                    Next.js pages and API route handlers
  api/                  REST API (auth, customers, products, orders, returns,
                        pickups, inspections, refunds, analytics, search, users)
  components/           Shared UI components
  returns/[id]/         Return detail page with workflow actions
lib/
  db.ts                 MySQL pool + transaction helpers (env-based config)
  mongo.ts              MongoDB client, document types
  auth.ts, session.ts   Password hashing, signed session cookies, role checks
  http.ts               Input parsing, database-error to HTTP mapping
  data/                 Data-access layer: SQL queries and aggregation pipelines
database/               SQL scripts (schema, constraints, routines, triggers, views,
                        seed, demonstration queries)
scripts/                Database setup and test scripts
docs/                   Project documentation and test results
proxy.ts                Redirects unauthenticated visitors to /login
```

## Modules

| Module | Description | Roles |
|--------|-------------|-------|
| Dashboard | KPIs, work queue, return rates, reasons, courier performance, warehouse dispositions, MongoDB inspection insights | Admin, Staff |
| Returns | Request returns, filter / full-text search, detail page with history, activity feed, inspection report and workflow actions | All (customers see their own) |
| Orders | Multi-item orders in a transaction, status updates | All (customers see their own) |
| Refunds | Refund queue with policy amounts, refund history | Admin, Staff |
| Customers | Customer list with order / return summary, add / delete | Admin (write), Staff (read) |
| Products | Catalogue with full-text search, return statistics, recovered stock | All (Admin writes) |
| Search | MySQL FULLTEXT + MongoDB `$text` across returns, inspections, reports, products | Admin, Staff |
| Users | Create staff / admin accounts, activate / deactivate | Admin |

## Database features demonstrated

* **DDL** — `CREATE` (tables, indexes, views, routines, triggers), `ALTER TABLE` (constraints), `DROP` (reset, re-creatable objects, demo in `07_queries.sql`)
* **Keys and constraints** — primary, foreign (including a composite FK), UNIQUE, NOT NULL, DEFAULT, 22 CHECK constraints
* **DML and queries** — INSERT, UPDATE, DELETE, SELECT with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries (scalar, correlated, `IN`, `NOT EXISTS`), UNION ALL
* **Transactions** — application transactions with rollback, a stored procedure with its own transaction and `EXIT HANDLER`, `SELECT … FOR UPDATE`, and an inspection kept consistent across MySQL and MongoDB
* **Stored procedures and functions** — return registration, inspection, refund processing, refund policy, workflow transitions
* **Triggers** — 23 triggers: return window / quantity / ownership rules, state machine, audit history, order totals, inventory, single disposition, refund limits
* **Views** — 6 views used by the API and dashboard
* **Indexing** — composite, status and date indexes (checked with `EXPLAIN`)
* **Full-text search** — FULLTEXT indexes queried in BOOLEAN and NATURAL LANGUAGE modes
* **MongoDB** — schema validation, unique / multikey / weighted text indexes, aggregation pipelines (`$unwind`, `$group`, `$cond`, `$avg`, `$push`), `$text` search
