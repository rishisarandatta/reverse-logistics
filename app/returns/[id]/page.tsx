import Link from "next/link";
import { notFound } from "next/navigation";
import ReturnActions from "./ReturnActions";
import MessageForm from "./MessageForm";
import StatusBadge from "../../components/StatusBadge";
import ReturnProgress from "../../components/ReturnProgress";
import { isStaff, requirePageSession } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getLookups } from "@/lib/data/lookups";
import { getReturnDetail } from "@/lib/data/returns";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">—</span>}</dd>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] px-5 py-4 first:border-t-0">
      <h3 className="mb-3 text-[13px] font-semibold">{title}</h3>
      <dl className="dl">{children}</dl>
    </div>
  );
}

export default async function ReturnDetailPage({ params }: PageProps<"/returns/[id]">) {
  const session = await requirePageSession();
  const returnId = Number((await params).id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();

  const [detail, lookups] = await Promise.all([getReturnDetail(returnId, session), getLookups()]);
  if (!detail) notFound();

  const { pipeline: r, history, events, report, refundPreview, mongoError } = detail;
  const staff = isStaff(session);

  return (
    <main className="page">
      <Link href="/returns" className="link text-[13px]">← Back to returns</Link>

      <div className="page-header mt-3">
        <div>
          <div className="flex items-center gap-3">
            <h1>Return #{r.ReturnID}</h1>
            <StatusBadge status={r.ReturnStatus} />
          </div>
          <p>
            {r.ProductName}
            {r.ReturnQty > 1 ? ` × ${r.ReturnQty}` : ""} · {r.CustomerName} · requested {formatDate(r.ReturnDate)}
          </p>
        </div>
      </div>

      <ReturnProgress
        status={r.ReturnStatus}
        history={history}
        dates={{
          Requested: r.ReturnDate,
          "Picked Up": r.PickupStatus === "Picked Up" ? r.PickupDate : null,
          Inspected: r.InspectionDate,
          Refunded: r.RefundDate,
        }}
      />

      {mongoError && <p className="notice mt-4">{mongoError}</p>}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {staff && (
            <ReturnActions
              returnId={r.ReturnID}
              status={r.ReturnStatus}
              pickupId={r.PickupID}
              pickupStatus={r.PickupStatus}
              category={r.CategoryName}
              customerAddress={r.CustomerAddress}
              refundPreview={refundPreview}
              couriers={lookups.couriers}
              warehouses={lookups.warehouses}
            />
          )}

          <section className="card card-flush">
            <Block title="Request">
              <Row label="Product">{r.ProductName} <span className="muted">({r.CategoryName})</span></Row>
              <Row label="Order">#{r.OrderID}, {formatDate(r.OrderDate)}</Row>
              <Row label="Reason">
                {r.ReasonName}
                {r.IsSellerFault ? <span className="badge badge-plain badge-amber ml-2">seller fault</span> : null}
              </Row>
              <Row label="Value">{r.ReturnQty} × {formatCurrency(r.UnitPrice)} = {formatCurrency(r.ReturnValue)}</Row>
              <Row label="Comments">{r.Comments}</Row>
            </Block>

            {r.PickupID && (
              <Block title="Pickup">
                <Row label="Status"><StatusBadge status={r.PickupStatus} /></Row>
                <Row label="Courier">{r.CourierName}</Row>
                <Row label="Date">{formatDate(r.PickupDate)}</Row>
              </Block>
            )}

            {r.InspectionID && (
              <Block title="Inspection">
                <Row label="Date">{formatDate(r.InspectionDate)}</Row>
                <Row label="Condition">{r.ProductCondition}</Row>
                <Row label="Outcome">
                  {r.Disposition}
                  {r.WarehouseName ? <span className="muted">, {r.WarehouseName}</span> : null}
                </Row>
                <Row label="Remarks">{r.InspectionRemarks}</Row>
              </Block>
            )}

            {(r.RefundID || r.InspectionID) && (
              <Block title="Refund">
                {r.RefundID ? (
                  <>
                    <Row label="Amount"><span className="font-semibold">{formatCurrency(r.RefundAmount)}</span></Row>
                    <Row label="Method">{r.RefundMethod}</Row>
                    <Row label="Date">{formatDate(r.RefundDate)}</Row>
                    <Row label="Status"><StatusBadge status={r.RefundStatus} /></Row>
                  </>
                ) : (
                  <Row label="Amount due">
                    {formatCurrency(refundPreview)} <span className="caption">calculated by fn_calculate_refund</span>
                  </Row>
                )}
              </Block>
            )}
          </section>

          {report && (
            <section className="card">
              <h2>
                Inspection report <span className="caption">MongoDB · inspection_reports</span>
              </h2>

              <dl className="dl mb-5">
                <Row label="Inspector">{report.inspector.username}, {formatDateTime(report.inspectedAt)}</Row>
                <Row label="Score">{report.conditionScore} / 10</Row>
                {Object.entries(report.attributes ?? {}).map(([key, value]) => (
                  <Row key={key} label={key}>
                    {Array.isArray(value) ? value.join(", ") || "none" : String(value)}
                  </Row>
                ))}
              </dl>

              <div className="overflow-hidden rounded-md border border-[var(--border)]">
                <table>
                  <thead><tr><th>Check</th><th>Result</th><th>Note</th></tr></thead>
                  <tbody>
                    {report.checklist.map((entry) => (
                      <tr key={entry.item}>
                        <td>{entry.item}</td>
                        <td>
                          {entry.passed
                            ? <span className="badge badge-green">Pass</span>
                            : <span className="badge badge-red">Fail</span>}
                        </td>
                        <td className="muted">{entry.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.defects.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-md border border-[var(--border)]">
                  <table>
                    <thead><tr><th>Defect</th><th>Severity</th><th>Location</th></tr></thead>
                    <tbody>
                      {report.defects.map((defect, index) => (
                        <tr key={index}>
                          <td>{defect.type}</td>
                          <td className="capitalize">{defect.severity}</td>
                          <td className="muted">{defect.location ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.notes && <p className="mt-4">{report.notes}</p>}
            </section>
          )}

          <section className="card card-flush">
            <h2>
              Status history <span className="caption">MySQL · written by trigger</span>
            </h2>
            <div className="table-wrap mt-3">
              <table>
                <thead><tr><th>When</th><th>Change</th><th>By</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.HistoryID}>
                      <td className="whitespace-nowrap">{formatDateTime(h.ChangedAt)}</td>
                      <td>
                        {h.OldStatus ? <span className="muted">{h.OldStatus} → </span> : null}
                        {h.NewStatus}
                      </td>
                      <td>{h.ChangedBy ?? <span className="muted">customer</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="card lg:sticky lg:top-6">
          <h2>
            Activity <span className="caption">MongoDB · return_events</span>
          </h2>
          <ol className="space-y-4">
            {events.map((event, index) => (
              <li key={index} className="border-l-2 border-[var(--border-strong)] pl-3">
                <p className="text-xs text-[var(--muted)]">
                  {formatDateTime(event.at)} · {event.actor.username ?? event.actor.role}
                  {event.actor.role !== "Customer" && event.actor.username ? ` (${event.actor.role})` : ""}
                </p>
                <p className="mt-0.5">{event.message}</p>
              </li>
            ))}
            {events.length === 0 && <li className="muted">No activity yet.</li>}
          </ol>
          <MessageForm returnId={r.ReturnID} />
        </aside>
      </div>
    </main>
  );
}
