import Link from "next/link";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { isStaff, requirePageSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { RETURN_STATUSES, countReturnsByStatus, listReturns } from "@/lib/data/returns";

export default async function ReturnsPage({ searchParams }: PageProps<"/returns">) {
  const session = await requirePageSession();
  const staff = isStaff(session);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const q = typeof params.q === "string" ? params.q : "";

  const [returns, counts] = await Promise.all([
    listReturns(session, { status: status || null, q: q || null }),
    countReturnsByStatus(session),
  ]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const chipHref = (s: string) => {
    const query = new URLSearchParams();
    if (s) query.set("status", s);
    if (q) query.set("q", q);
    const text = query.toString();
    return text ? `/returns?${text}` : "/returns";
  };

  return (
    <main className="page">
      <PageHeader
        title={staff ? "Returns" : "My returns"}
        description={staff ? "Every return request and where it is in the process." : "Your return requests and their progress."}
      >
        <Link href="/returns/new" className="btn">{staff ? "New return" : "Request a return"}</Link>
      </PageHeader>

      <div className="chips mb-4">
        <Link href={chipHref("")} className={`chip ${!status ? "chip-active" : ""}`}>
          All <span className="chip-count">{total}</span>
        </Link>
        {RETURN_STATUSES.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={chipHref(s)} className={`chip ${status === s ? "chip-active" : ""}`}>
            {s} <span className="chip-count">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <div className="card card-flush">
        <form className="toolbar" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="q">{staff ? "Search comments and inspection remarks" : "Search your returns"}</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="e.g. battery, cracked, size" />
          </div>
          <button className="btn btn-secondary" type="submit">Search</button>
          {q && (
            <Link href={status ? `/returns?status=${encodeURIComponent(status)}` : "/returns"} className="btn btn-secondary">
              Clear
            </Link>
          )}
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Return</th>
                <th>Requested</th>
                {staff && <th>Customer</th>}
                <th>Product</th>
                <th>Reason</th>
                <th>Status</th>
                <th className="num">Value</th>
                <th className="num">Refund</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.ReturnID}>
                  <td><Link href={`/returns/${r.ReturnID}`} className="link">#{r.ReturnID}</Link></td>
                  <td>{formatDate(r.ReturnDate)}</td>
                  {staff && <td>{r.CustomerName}</td>}
                  <td>
                    {r.ProductName}
                    {r.ReturnQty > 1 && <span className="muted"> × {r.ReturnQty}</span>}
                  </td>
                  <td>{r.ReasonName}</td>
                  <td><StatusBadge status={r.ReturnStatus} /></td>
                  <td className="num">{formatCurrency(r.ReturnValue)}</td>
                  <td className="num">{r.RefundAmount === null ? <span className="muted">—</span> : formatCurrency(r.RefundAmount)}</td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr>
                  <td colSpan={staff ? 8 : 7} className="table-empty">
                    {q || status ? "No returns match these filters." : "No returns yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
