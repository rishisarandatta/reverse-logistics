
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type CountRow = RowDataPacket & { total: number };

export default async function Home() {
  let customers = "—";
  let products = "—";
  let orders = "—";

  try {
    const [customerRows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM CUSTOMER"
    );
    const [productRows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM PRODUCT"
    );
    const [orderRows] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS total FROM ORDERS"
    );

    customers = String(customerRows[0].total);
    products = String(productRows[0].total);
    orders = String(orderRows[0].total);
  } catch (error) {
    console.error("Database connection error:", error);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 px-8 py-5 text-white">
        <h1 className="text-2xl font-bold">
          Reverse Logistics Management System
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          Customer, product and order management
        </p>
      </header>

      <div className="mx-auto max-w-7xl p-8">
        <h2 className="mb-6 text-2xl font-semibold">Dashboard</h2>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Customers</p>
            <p className="mt-2 text-3xl font-bold">{customers}</p>
            <p className="mt-2 text-sm text-slate-500">
              Registered customers
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Products</p>
            <p className="mt-2 text-3xl font-bold">{products}</p>
            <p className="mt-2 text-sm text-slate-500">
              Product catalogue
            </p>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Orders</p>
            <p className="mt-2 text-3xl font-bold">{orders}</p>
            <p className="mt-2 text-sm text-slate-500">
              Customer orders
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Core Modules</h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-5">
              <h3 className="font-semibold">Customer Management</h3>
              <p className="mt-2 text-sm text-slate-500">
                Manage customer records and customer types.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-5">
              <h3 className="font-semibold">Product Management</h3>
              <p className="mt-2 text-sm text-slate-500">
                View products, categories and prices.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-5">
              <h3 className="font-semibold">Order Management</h3>
              <p className="mt-2 text-sm text-slate-500">
                View orders and their associated items.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}