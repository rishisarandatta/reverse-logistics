import Link from "next/link";
import CustomerForm from "./CustomerForm";
import DeleteButton from "../components/DeleteButton";
import Disclosure from "../components/Disclosure";
import PageHeader from "../components/PageHeader";
import { requirePageSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { listCustomers } from "@/lib/data/catalog";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const session = await requirePageSession("Admin", "Staff");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" ? params.type : "";

  const customers = await listCustomers({ q: q || null, type: type || null });
  const admin = session.role === "Admin";

  return (
    <main className="page">
      <PageHeader title="Customers" description="Customer records with their order and return history." />

      {admin && (
        <Disclosure label="Add customer">
          <CustomerForm />
        </Disclosure>
      )}

      <div className="card card-flush">
        <form className="toolbar" method="get">
          <div className="min-w-60 flex-1">
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Name, email or phone" />
          </div>
          <div className="w-40">
            <label className="label" htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={type} className="input">
              <option value="">All types</option>
              <option value="Regular">Regular</option>
              <option value="Premium">Premium</option>
            </select>
          </div>
          <button className="btn btn-secondary" type="submit">Apply</button>
          {(q || type) && <Link href="/customers" className="btn btn-secondary">Clear</Link>}
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Type</th>
                <th className="num">Orders</th>
                <th className="num">Spent</th>
                <th className="num">Returns</th>
                <th className="num">Refunded</th>
                {admin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.CustomerID}>
                  <td>
                    <div className="font-medium">{c.Name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      #{c.CustomerID}{c.Username ? ` · login: ${c.Username}` : ""}
                    </div>
                  </td>
                  <td>
                    <div>{c.Email}</div>
                    <div className="text-xs text-[var(--muted)]">{c.Phone ?? "No phone"}</div>
                  </td>
                  <td>{c.CustomerType}</td>
                  <td className="num">{c.TotalOrders}</td>
                  <td className="num">{formatCurrency(c.TotalSpent)}</td>
                  <td className="num">{c.TotalReturns}</td>
                  <td className="num">{formatCurrency(c.TotalRefunded)}</td>
                  {admin && (
                    <td className="text-right">
                      <DeleteButton url={`/api/customers/${c.CustomerID}`} confirmText={`Delete customer ${c.Name}?`} />
                    </td>
                  )}
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={admin ? 8 : 7} className="table-empty">No customers match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
