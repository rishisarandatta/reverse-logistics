import Link from "next/link";
import PickupActions from "./PickupActions";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { requirePageSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { PICKUP_STATUSES, countPickupsByStatus, listAwaitingPickup, listPickups } from "@/lib/data/pickups";

export default async function PickupsPage({ searchParams }: PageProps<"/pickups">) {
  await requirePageSession("Admin", "Staff");
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";

  const [pickups, counts, awaiting] = await Promise.all([
    listPickups({ status: status || null }),
    countPickupsByStatus(),
    listAwaitingPickup(),
  ]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <main className="page">
      <PageHeader title="Pickups" description="Courier collections for approved returns." />

      <h2 className="section-title mt-0">Waiting for a courier ({awaiting.length})</h2>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Return</th><th>Approved return from</th><th>Customer</th><th>Product</th><th>Pickup address</th><th></th></tr>
            </thead>
            <tbody>
              {awaiting.map((r) => (
                <tr key={r.ReturnID}>
                  <td><Link href={`/returns/${r.ReturnID}`} className="link">#{r.ReturnID}</Link></td>
                  <td className="whitespace-nowrap">{formatDate(r.ReturnDate)}</td>
                  <td>{r.CustomerName}</td>
                  <td>{r.ProductName}</td>
                  <td className="muted">{r.CustomerAddress ?? "—"}</td>
                  <td className="text-right">
                    <Link href={`/returns/${r.ReturnID}`} className="btn btn-sm">Book pickup</Link>
                  </td>
                </tr>
              ))}
              {awaiting.length === 0 && (
                <tr><td colSpan={6} className="table-empty">Every approved return has a pickup booked.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">All pickups</h2>
      <div className="chips mb-4">
        <Link href="/pickups" className={`chip ${!status ? "chip-active" : ""}`}>
          All <span className="chip-count">{total}</span>
        </Link>
        {PICKUP_STATUSES.filter((s) => counts[s]).map((s) => (
          <Link
            key={s}
            href={`/pickups?status=${encodeURIComponent(s)}`}
            className={`chip ${status === s ? "chip-active" : ""}`}
          >
            {s} <span className="chip-count">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pickup</th><th>Date</th><th>Courier</th><th>Return</th><th>Customer</th>
                <th>Address</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pickups.map((p) => (
                <tr key={p.PickupID}>
                  <td className="font-medium">#{p.PickupID}</td>
                  <td className="whitespace-nowrap">{formatDate(p.PickupDate)}</td>
                  <td>{p.CourierName}</td>
                  <td>
                    <Link href={`/returns/${p.ReturnID}`} className="link">#{p.ReturnID}</Link>
                    <div className="text-xs text-[var(--muted)]">{p.ProductName}</div>
                  </td>
                  <td>{p.CustomerName}</td>
                  <td className="muted">{p.PickupAddress}</td>
                  <td><StatusBadge status={p.PickupStatus} /></td>
                  <td className="text-right">
                    <PickupActions pickupId={p.PickupID} returnId={p.ReturnID} status={p.PickupStatus} />
                  </td>
                </tr>
              ))}
              {pickups.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No pickups match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
