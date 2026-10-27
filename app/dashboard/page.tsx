import type { RowDataPacket } from "mysql2";
import DataTable from "../components/DataTable";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { requirePageSession } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { getMongoAnalytics, getSqlAnalytics, type MongoAnalytics } from "@/lib/data/analytics";

type Row = RowDataPacket;

// A report panel. `source` names the database technique behind it, which
// is useful during the project demonstration.
function Panel({ title, source, children }: { title: string; source: string; children: React.ReactNode }) {
  return (
    <section className="card card-flush">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <span className="caption text-right">{source}</span>
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  await requirePageSession("Admin", "Staff");

  const [sql, mongo] = await Promise.all([
    getSqlAnalytics(),
    getMongoAnalytics().catch((error): MongoAnalytics | null => {
      console.error("MongoDB analytics failed:", error);
      return null;
    }),
  ]);
  const k = sql.kpis;

  return (
    <main className="page">
      <PageHeader title="Analytics" description="How returns are trending, why products come back, and what inspections find." />

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Revenue</div>
          <div className="stat-value">{formatCurrency(k.revenue)}</div>
          <div className="stat-hint">{k.orders} orders, {k.customers} customers</div>
        </div>
        <div className="stat">
          <div className="stat-label">Returns</div>
          <div className="stat-value">{k.returns}</div>
          <div className="stat-hint">{k.openReturns} still open</div>
        </div>
        <div className="stat">
          <div className="stat-label">Refunded</div>
          <div className="stat-value">{formatCurrency(k.refunded)}</div>
          <div className="stat-hint">Processed refunds</div>
        </div>
        <div className="stat">
          <div className="stat-label">Time to refund</div>
          <div className="stat-value">{k.avgDaysToRefund ?? "—"} days</div>
          <div className="stat-hint">Average, request to refund</div>
        </div>
      </div>

      <h2 className="section-title">Returns</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="By status" source="GROUP BY">
          <DataTable<Row>
            rows={sql.returnsByStatus}
            columns={[
              { label: "Status", render: (r) => <StatusBadge status={r.ReturnStatus} /> },
              { label: "Returns", render: (r) => r.total, numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Why products come back" source="GROUP BY + scalar subquery">
          <DataTable<Row>
            rows={sql.reasonBreakdown}
            columns={[
              { label: "Reason", render: (r) => r.ReasonName },
              { label: "Seller fault", render: (r) => (r.IsSellerFault ? "Yes" : "No") },
              { label: "Returns", render: (r) => r.total, numeric: true },
              { label: "Share", render: (r) => `${r.pct}%`, numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Return rate by category" source="JOIN + GROUP BY + HAVING">
          <DataTable<Row>
            rows={sql.categoryReturnRates}
            columns={[
              { label: "Category", render: (r) => r.CategoryName },
              { label: "Sold", render: (r) => r.unitsSold, numeric: true },
              { label: "Returned", render: (r) => r.unitsReturned, numeric: true },
              { label: "Rate", render: (r) => `${r.returnRatePct}%`, numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Products returned more than average" source="subquery on ProductReturnStatsView">
          <DataTable<Row>
            rows={sql.aboveAverageProducts}
            columns={[
              { label: "Product", render: (r) => r.ProductName },
              { label: "Sold", render: (r) => r.UnitsSold, numeric: true },
              { label: "Returned", render: (r) => r.UnitsReturned, numeric: true },
              { label: "Rate", render: (r) => `${r.ReturnRatePct}%`, numeric: true },
            ]}
          />
        </Panel>

        <Panel title="By month" source="GROUP BY month, conditional SUM">
          <DataTable<Row>
            rows={sql.monthlyTrend}
            columns={[
              { label: "Month", render: (r) => r.month },
              { label: "Returns", render: (r) => r.returns, numeric: true },
              { label: "Seller fault", render: (r) => r.sellerFault, numeric: true },
              { label: "Refunded", render: (r) => formatCurrency(r.refunded), numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Customers with 2+ returns" source="GROUP BY + HAVING COUNT ≥ 2">
          <DataTable<Row>
            rows={sql.repeatReturners}
            empty="No customer has two or more returns."
            columns={[
              { label: "Customer", render: (r) => r.Name },
              { label: "Type", render: (r) => r.CustomerType },
              { label: "Returns", render: (r) => r.returns, numeric: true },
              { label: "Value", render: (r) => formatCurrency(r.returnValue), numeric: true },
            ]}
          />
        </Panel>
      </div>

      <h2 className="section-title">Operations</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Courier performance" source="LEFT JOIN + conditional aggregation">
          <DataTable<Row>
            rows={sql.courierPerformance}
            columns={[
              { label: "Courier", render: (r) => r.CourierName },
              { label: "Pickups", render: (r) => r.pickups, numeric: true },
              { label: "Collected", render: (r) => r.completed ?? 0, numeric: true },
              { label: "Failed", render: (r) => r.failed ?? 0, numeric: true },
              { label: "Avg days", render: (r) => r.avgDaysToPickup ?? "—", numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Warehouse outcomes" source="WarehouseDispositionView (UNION ALL)">
          <DataTable<Row>
            rows={sql.warehouseDispositions}
            columns={[
              { label: "Warehouse", render: (r) => r.WarehouseName },
              { label: "Outcome", render: (r) => r.Disposition },
              { label: "Items", render: (r) => r.Items, numeric: true },
            ]}
          />
        </Panel>

        <Panel title="Stock recovered by restocking" source="INVENTORY, maintained by trigger">
          <DataTable<Row>
            rows={sql.recoveredInventory}
            empty="Nothing restocked yet."
            columns={[
              { label: "Product", render: (r) => r.ProductName },
              { label: "Warehouse", render: (r) => r.WarehouseName },
              { label: "Units", render: (r) => r.Quantity, numeric: true },
            ]}
          />
        </Panel>
      </div>

      <h2 className="section-title">Inspection findings · MongoDB</h2>
      {!mongo ? (
        <p className="notice">MongoDB is unavailable, so inspection findings cannot be shown.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Most common defects" source="$unwind → $group → $sort">
            <DataTable
              rows={mongo.defectsByCategory}
              columns={[
                { label: "Category", render: (r) => r.category },
                { label: "Defect", render: (r) => r.defect },
                { label: "Severity", render: (r) => r.severities.join(", ") },
                { label: "Count", render: (r) => r.count, numeric: true },
              ]}
            />
          </Panel>

          <Panel title="Condition by category" source="$group with $avg">
            <DataTable
              rows={mongo.conditionByCategory}
              columns={[
                { label: "Category", render: (r) => r.category },
                { label: "Outcomes", render: (r) => r.dispositions.join(", ") },
                { label: "Reports", render: (r) => r.reports, numeric: true },
                { label: "Avg score", render: (r) => `${r.avgScore} / 10`, numeric: true },
              ]}
            />
          </Panel>

          <Panel title="Checks that fail most" source="$unwind → $group with $cond">
            <DataTable
              rows={mongo.checklistFailures}
              columns={[
                { label: "Category", render: (r) => r.category },
                { label: "Check", render: (r) => r.item },
                { label: "Failed", render: (r) => `${r.failures} of ${r.checks}`, numeric: true },
              ]}
            />
          </Panel>

          <Panel title="Activity feed" source="return_events $group by type">
            <DataTable
              rows={mongo.eventActivity}
              columns={[
                { label: "Event", render: (r) => r.type.replaceAll("_", " ").toLowerCase() },
                { label: "Last", render: (r) => formatDateTime(r.lastAt) },
                { label: "Count", render: (r) => r.count, numeric: true },
              ]}
            />
          </Panel>
        </div>
      )}
    </main>
  );
}
