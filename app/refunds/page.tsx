import Link from "next/link";
import RefundButton from "./RefundButton";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { requirePageSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { listPendingRefunds, listRefunds } from "@/lib/data/catalog";

export default async function RefundsPage() {
  await requirePageSession("Admin", "Staff");
  const [pending, refunds] = await Promise.all([listPendingRefunds(), listRefunds()]);
  const totalRefunded = refunds.reduce((sum, r) => sum + Number(r.RefundAmount), 0);

  return (
    <main className="page">
      <PageHeader
        title="Refunds"
        description="Seller-fault returns are refunded in full. Others are refunded by condition: like new 100%, good 90%, fair 70%, damaged or defective 40%."
      />

      <h2 className="section-title mt-0">Waiting for refund ({pending.length})</h2>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Return</th><th>Customer</th><th>Product</th><th>Reason</th><th>Condition</th>
                <th className="num">Item value</th><th className="num">Refund due</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.ReturnID}>
                  <td><Link href={`/returns/${p.ReturnID}`} className="link">#{p.ReturnID}</Link></td>
                  <td>{p.CustomerName}</td>
                  <td>{p.ProductName}</td>
                  <td>{p.ReasonName}</td>
                  <td>{p.ProductCondition}</td>
                  <td className="num">{formatCurrency(p.ReturnValue)}</td>
                  <td className="num font-semibold">{formatCurrency(p.RefundDue)}</td>
                  <td className="text-right"><RefundButton pickupId={p.PickupID} /></td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No inspected returns are waiting for a refund.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="section-title">
        Refund history <span className="normal-case tracking-normal">· {formatCurrency(totalRefunded)} in total</span>
      </h2>
      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Return</th><th>Customer</th><th>Product</th><th>Method</th>
                <th className="num">Item value</th><th className="num">Refunded</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.RefundID}>
                  <td className="whitespace-nowrap">{formatDate(r.RefundDate)}</td>
                  <td><Link href={`/returns/${r.ReturnID}`} className="link">#{r.ReturnID}</Link></td>
                  <td>{r.CustomerName}</td>
                  <td>{r.ProductName}</td>
                  <td>{r.RefundMethod}</td>
                  <td className="num">{formatCurrency(r.ReturnValue)}</td>
                  <td className="num">{formatCurrency(r.RefundAmount)}</td>
                  <td><StatusBadge status={r.RefundStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
