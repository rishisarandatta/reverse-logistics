import ReturnForm from "./ReturnForm";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface ReturnRow extends RowDataPacket {
  ReturnID: number;
  OrderID: number;
  OrderItemID: number;
  ReturnDate: string | null;
  ReturnStatus: string | null;
  Comments: string | null;
}

export default async function ReturnsPage() {
  const [returns] = await pool.query<ReturnRow[]>(`
    SELECT
      ReturnID,
      OrderID,
      OrderItemID,
      ReturnDate,
      ReturnStatus,
      Comments
    FROM RETURNS
    ORDER BY ReturnID DESC
  `);

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-900">
      <h1 className="mb-6 text-3xl font-bold">
        Returns Management
      </h1>

      <ReturnForm />

      <section className="mt-8 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Return Records</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-200">
                <th className="border p-3">Return ID</th>
                <th className="border p-3">Order ID</th>
                <th className="border p-3">Order Item ID</th>
                <th className="border p-3">Return Date</th>
                <th className="border p-3">Return Status</th>
                <th className="border p-3">Comments</th>
              </tr>
            </thead>

            <tbody>
              {returns.map((item) => (
                <tr key={item.ReturnID}>
                  <td className="border p-3">{item.ReturnID}</td>
                  <td className="border p-3">{item.OrderID}</td>
                  <td className="border p-3">{item.OrderItemID}</td>
                  <td className="border p-3">
                    {item.ReturnDate
                      ? new Date(item.ReturnDate).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td className="border p-3">
                    {item.ReturnStatus ?? "Unknown"}
                  </td>
                  <td className="border p-3">{item.Comments ?? "—"}</td>
                </tr>
              ))}

              {returns.length === 0 && (
                <tr>
                  <td colSpan={6} className="border p-4 text-center">
                    No returns found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}