import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import PageHeader from "./components/PageHeader";
import StatusBadge from "./components/StatusBadge";
import { isStaff, requirePageSession, type Session } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { countReturnsByStatus, listReturns, type ReturnRow } from "@/lib/data/returns";

export default async function Home() {
  const session = await requirePageSession();
  return isStaff(session) ? <StaffHome session={session} /> : <CustomerHome session={session} />;
}

async function StaffHome({ session }: { session: Session }) {
  const [counts, [queue]] = await Promise.all([
    countReturnsByStatus(session),
    pool.query<RowDataPacket[]>("SELECT * FROM PendingActionsView ORDER BY DaysOpen DESC LIMIT 10"),
  ]);

  const tiles = [
    { label: "To review", status: "Requested", hint: "Approve or reject" },
    { label: "Awaiting pickup", status: "Approved", hint: "Book a courier" },
    { label: "Pickup booked", status: "Pickup Scheduled", hint: "Confirm collection" },
    { label: "To inspect", status: "Picked Up", hint: "Inspect the item" },
    { label: "To refund", status: "Inspected", hint: "Issue the refund" },
  ];

  return (
    <main className="page">
      <PageHeader title="Overview" description={`Signed in as ${session.username}. Returns that need action are listed below.`}>
        <Link href="/returns/new" className="btn btn-secondary">New return</Link>
        <Link href="/dashboard" className="btn">Analytics</Link>
      </PageHeader>

      <div className="stats">
        {tiles.map((tile) => (
          <Link key={tile.status} href={`/returns?status=${encodeURIComponent(tile.status)}`} className="stat block hover:bg-[var(--surface-muted)]">
            <div className="stat-label">{tile.label}</div>
            <div className="stat-value">{counts[tile.status] ?? 0}</div>
            <div className="stat-hint">{tile.hint}</div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">Work queue</h2>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Return</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Status</th>
                <th>Next action</th>
                <th className="num">Days open</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.ReturnID}>
                  <td><Link href={`/returns/${r.ReturnID}`} className="link">#{r.ReturnID}</Link></td>
                  <td>{r.CustomerName}</td>
                  <td>{r.ProductName}</td>
                  <td><StatusBadge status={r.ReturnStatus} /></td>
                  <td>{r.NextAction}</td>
                  <td className="num">{r.DaysOpen}</td>
                </tr>
              ))}
              {queue.length === 0 && (
                <tr><td colSpan={6} className="table-empty">Nothing needs attention right now.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

// What the customer should expect next, in plain words.
function customerNextStep(r: ReturnRow): string {
  switch (r.ReturnStatus) {
    case "Requested": return "Waiting for our team to review your request";
    case "Approved": return "Approved. We will book a pickup shortly";
    case "Pickup Scheduled": return `Courier pickup on ${formatDate(r.PickupDate)}`;
    case "Picked Up": return "Collected. The item is being inspected";
    case "Inspected": return "Inspected. Your refund is being processed";
    case "Refunded": return `Refunded ${formatCurrency(r.RefundAmount)}`;
    case "Rejected": return "The return request was not accepted";
    case "Closed": return "Closed after inspection";
    default: return "";
  }
}

async function CustomerHome({ session }: { session: Session }) {
  const [returns, [summary]] = await Promise.all([
    listReturns(session),
    pool.query<RowDataPacket[]>(
      "SELECT TotalOrders, TotalReturns, TotalRefunded FROM CustomerReturnSummaryView WHERE CustomerID = ?",
      [session.customerId]
    ),
  ]);
  const s = summary[0] ?? { TotalOrders: 0, TotalReturns: 0, TotalRefunded: 0 };
  const open = returns.filter((r) => !["Refunded", "Rejected", "Closed"].includes(r.ReturnStatus)).length;

  return (
    <main className="page">
      <PageHeader title={`Hello, ${session.username}`} description="Track your returns and orders.">
        <Link href="/orders/new" className="btn btn-secondary">Place an order</Link>
        <Link href="/returns/new" className="btn">Request a return</Link>
      </PageHeader>

      <div className="stats">
        <div className="stat"><div className="stat-label">Orders</div><div className="stat-value">{s.TotalOrders}</div></div>
        <div className="stat"><div className="stat-label">Returns in progress</div><div className="stat-value">{open}</div></div>
        <div className="stat"><div className="stat-label">Total returns</div><div className="stat-value">{s.TotalReturns}</div></div>
        <div className="stat"><div className="stat-label">Refunded to you</div><div className="stat-value">{formatCurrency(s.TotalRefunded)}</div></div>
      </div>

      <h2 className="section-title">Your returns</h2>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Return</th><th>Product</th><th>Requested</th><th>Status</th><th>What happens next</th></tr>
            </thead>
            <tbody>
              {returns.slice(0, 8).map((r) => (
                <tr key={r.ReturnID}>
                  <td><Link href={`/returns/${r.ReturnID}`} className="link">#{r.ReturnID}</Link></td>
                  <td>{r.ProductName}</td>
                  <td>{formatDate(r.ReturnDate)}</td>
                  <td><StatusBadge status={r.ReturnStatus} /></td>
                  <td className="muted">{customerNextStep(r)}</td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr><td colSpan={5} className="table-empty">You have no returns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
