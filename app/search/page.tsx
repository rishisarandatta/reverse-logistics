import Link from "next/link";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { requirePageSession } from "@/lib/auth";
import { searchEverything } from "@/lib/data/search";

function ResultGroup({ title, source, count, children }: { title: string; source: string; count: number; children: React.ReactNode }) {
  return (
    <section className="card card-flush">
      <div className="flex items-baseline justify-between border-b border-[var(--border)] px-5 py-3">
        <h2 className="text-[14px] font-semibold">
          {title} <span className="muted font-normal">({count})</span>
        </h2>
        <span className="caption">{source}</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {children}
        {count === 0 && <li className="px-5 py-4 text-[var(--muted)]">No matches.</li>}
      </ul>
    </section>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requirePageSession("Admin", "Staff");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const results = q ? await searchEverything(q) : null;

  return (
    <main className="page">
      <PageHeader title="Search" description="Search customer comments, inspection notes and products in one place." />

      <form method="get" className="mb-6 flex gap-2">
        <input name="q" defaultValue={q} className="input max-w-xl" placeholder="e.g. battery, cracked, stains" aria-label="Search" autoFocus />
        <button className="btn" type="submit">Search</button>
      </form>

      {results?.mongoError && <p className="notice mb-4">{results.mongoError}</p>}

      {!results && <p className="muted">Enter a word or two. Partial words work too: “charg” finds “charging”.</p>}

      {results && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ResultGroup title="Return comments" source="MySQL FULLTEXT" count={results.returns.length}>
            {results.returns.map((r) => (
              <li key={r.ReturnID} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/returns/${r.ReturnID}`} className="link">Return #{r.ReturnID}</Link>
                  <span className="muted">{r.ProductName}</span>
                  <StatusBadge status={r.ReturnStatus} />
                </div>
                <p className="mt-1">{r.Comments}</p>
              </li>
            ))}
          </ResultGroup>

          <ResultGroup title="Inspection reports" source="MongoDB $text" count={results.reports.length}>
            {results.reports.map((r) => (
              <li key={r.inspectionId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/returns/${r.returnId}`} className="link">Return #{r.returnId}</Link>
                  <span className="muted">{r.productName} · {r.category}</span>
                </div>
                <p className="mt-1">{r.notes}</p>
              </li>
            ))}
          </ResultGroup>

          <ResultGroup title="Inspection remarks" source="MySQL FULLTEXT" count={results.inspections.length}>
            {results.inspections.map((i) => (
              <li key={i.InspectionID} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/returns/${i.ReturnID}`} className="link">Return #{i.ReturnID}</Link>
                  <span className="muted">{i.ProductCondition}</span>
                </div>
                <p className="mt-1">{i.Remarks}</p>
              </li>
            ))}
          </ResultGroup>

          <ResultGroup title="Products" source="MySQL FULLTEXT" count={results.products.length}>
            {results.products.map((p) => (
              <li key={p.ProductID} className="px-5 py-3">
                <span className="font-medium">{p.ProductName}</span>
                <span className="muted"> · {p.SKU} · {p.CategoryName}</span>
              </li>
            ))}
          </ResultGroup>
        </div>
      )}
    </main>
  );
}
