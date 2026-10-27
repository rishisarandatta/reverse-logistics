import Link from "next/link";
import ProductForm from "./ProductForm";
import DeleteButton from "../components/DeleteButton";
import Disclosure from "../components/Disclosure";
import PageHeader from "../components/PageHeader";
import { isStaff, requirePageSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { listProducts } from "@/lib/data/catalog";
import { getLookups } from "@/lib/data/lookups";

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const session = await requirePageSession();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const categoryId = Number(params.categoryId) || null;

  const [products, lookups] = await Promise.all([
    listProducts({ q: q || null, categoryId }),
    getLookups(),
  ]);
  const admin = session.role === "Admin";
  const staff = isStaff(session);

  return (
    <main className="page">
      <PageHeader
        title="Products"
        description={staff ? "The catalogue, with how often each product comes back." : "Browse the product catalogue."}
      />

      {admin && (
        <Disclosure label="Add product">
          <ProductForm categories={lookups.categories} />
        </Disclosure>
      )}

      <div className="card card-flush">
        <form className="toolbar" method="get">
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Product name" />
          </div>
          <div className="w-48">
            <label className="label" htmlFor="categoryId">Category</label>
            <select id="categoryId" name="categoryId" defaultValue={categoryId ?? ""} className="input">
              <option value="">All categories</option>
              {lookups.categories.map((c) => (
                <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" type="submit">Apply</button>
          {(q || categoryId) && <Link href="/products" className="btn btn-secondary">Clear</Link>}
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="num">Price</th>
                {staff && (
                  <>
                    <th className="num">Sold</th>
                    <th className="num">Returned</th>
                    <th className="num">Return rate</th>
                    <th className="num">Recovered stock</th>
                  </>
                )}
                {admin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.ProductID}>
                  <td>
                    <div className="font-medium">{p.ProductName}</div>
                    <div className="text-xs text-[var(--muted)]">{p.SKU}</div>
                  </td>
                  <td>{p.CategoryName}</td>
                  <td className="num">{formatCurrency(p.UnitPrice)}</td>
                  {staff && (
                    <>
                      <td className="num">{p.UnitsSold}</td>
                      <td className="num">{p.UnitsReturned}</td>
                      <td className="num">{p.ReturnRatePct === null ? "—" : `${p.ReturnRatePct}%`}</td>
                      <td className="num">{p.RecoveredStock}</td>
                    </>
                  )}
                  {admin && (
                    <td className="text-right">
                      <DeleteButton url={`/api/products/${p.ProductID}`} confirmText={`Delete ${p.ProductName}?`} />
                    </td>
                  )}
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No products match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
