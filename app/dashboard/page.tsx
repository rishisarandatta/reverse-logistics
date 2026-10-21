import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface CountResult extends RowDataPacket {
  total: number;
}

interface RevenueResult extends RowDataPacket {
  totalRevenue: number | null;
}

interface StatusResult extends RowDataPacket {
  OrderStatus: string | null;
  count: number;
}

export default async function DashboardPage() {
  // Total customers
  const [customerCount] = await pool.query<CountResult[]>(`
    SELECT COUNT(*) AS total
    FROM CUSTOMER
  `);

  // Total products
  const [productCount] = await pool.query<CountResult[]>(`
    SELECT COUNT(*) AS total
    FROM PRODUCT
  `);

  // Total orders
  const [orderCount] = await pool.query<CountResult[]>(`
    SELECT COUNT(*) AS total
    FROM ORDERS
  `);

  // Total order revenue
  const [revenue] = await pool.query<RevenueResult[]>(`
    SELECT COALESCE(SUM(TotalAmount), 0) AS totalRevenue
    FROM ORDERS
  `);

  // Orders grouped by status
  const [statuses] = await pool.query<StatusResult[]>(`
    SELECT OrderStatus, COUNT(*) AS count
    FROM ORDERS
    GROUP BY OrderStatus
    ORDER BY OrderStatus
  `);

  // Total returns
  const [returnCount] = await pool.query<CountResult[]>(`
    SELECT COUNT(*) AS total
    FROM RETURNS
  `);

  // Returns grouped by status
  const [returnStatuses] = await pool.query<StatusResult[]>(`
    SELECT ReturnStatus AS OrderStatus, COUNT(*) AS count
    FROM RETURNS
    GROUP BY ReturnStatus
    ORDER BY ReturnStatus
  `);

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
      <h1 className="mb-8 text-3xl font-bold">
        Reverse Logistics Dashboard
      </h1>

      {/* Overall Statistics */}
      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">
          Overview
        </h2>

        <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-200">
                <th className="border p-3">Total Customers</th>
                <th className="border p-3">Total Products</th>
                <th className="border p-3">Total Orders</th>
                <th className="border p-3">Total Order Revenue</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="border p-3">
                  {customerCount[0].total}
                </td>
                <td className="border p-3">
                  {productCount[0].total}
                </td>
                <td className="border p-3">
                  {orderCount[0].total}
                </td>
                <td className="border p-3">
                  ₹{Number(revenue[0].totalRevenue).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Orders by Status */}
      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">
          Orders by Status
        </h2>

        <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-200">
                <th className="border p-3">Order Status</th>
                <th className="border p-3">Number of Orders</th>
              </tr>
            </thead>

            <tbody>
              {statuses.map((status) => (
                <tr key={status.OrderStatus ?? "Unknown"}>
                  <td className="border p-3">
                    {status.OrderStatus ?? "Unknown"}
                  </td>
                  <td className="border p-3">
                    {status.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Returns Overview */}
      <section className="mb-8">
        <h2 className="mb-4 text-2xl font-semibold">
          Returns Overview
        </h2>

        <div className="inline-block rounded-xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Total Returns
          </p>
          <p className="mt-2 text-3xl font-bold">
            {returnCount[0].total}
          </p>
        </div>
      </section>

      {/* Returns by Status */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">
          Returns by Status
        </h2>

        <div className="overflow-x-auto rounded-xl bg-white p-4 shadow-sm">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-200">
                <th className="border p-3">Return Status</th>
                <th className="border p-3">Number of Returns</th>
              </tr>
            </thead>

            <tbody>
              {returnStatuses.map((status) => (
                <tr key={status.OrderStatus ?? "Unknown"}>
                  <td className="border p-3">
                    {status.OrderStatus ?? "Unknown"}
                  </td>
                  <td className="border p-3">
                    {status.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}