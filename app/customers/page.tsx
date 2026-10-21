import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface Customer extends RowDataPacket {
  CustomerID: number;
  Name: string;
  Email: string | null;
  Phone: string | null;
  Address: string | null;
  CustomerType: string | null;
  OrderID: number | null;
  OrderDate: string | null;
  TotalAmount: number | null;
  OrderStatus: string | null;
}

export default async function CustomersPage() {
  const [customers] = await pool.query<Customer[]>(`
    SELECT
      c.CustomerID,
      c.Name,
      c.Email,
      c.Phone,
      c.Address,
      c.CustomerType,
      o.OrderID,
      o.OrderDate,
      o.TotalAmount,
      o.OrderStatus
    FROM CUSTOMER c
    LEFT JOIN ORDERS o
      ON c.CustomerID = o.CustomerID
    ORDER BY c.CustomerID, o.OrderID DESC
  `);

  return (
    <main>
      <h1>Customer Management</h1>

      <table border={1} cellPadding={10}>
        <thead>
          <tr>
            <th>Customer ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Customer Type</th>
            <th>Order ID</th>
            <th>Order Date</th>
            <th>Total Amount</th>
            <th>Order Status</th>
          </tr>
        </thead>

        <tbody>
          {customers.map((customer, index) => (
            <tr
              key={`${customer.CustomerID}-${customer.OrderID ?? "none"}-${index}`}
            >
              <td>{customer.CustomerID}</td>
              <td>{customer.Name}</td>
              <td>{customer.Email ?? "—"}</td>
              <td>{customer.Phone ?? "—"}</td>
              <td>{customer.CustomerType ?? "—"}</td>
              <td>{customer.OrderID ?? "No orders"}</td>
              <td>
                {customer.OrderDate
                  ? new Date(customer.OrderDate).toLocaleDateString("en-IN")
                  : "—"}
              </td>
              <td>
                {customer.TotalAmount !== null
                  ? `₹${Number(customer.TotalAmount).toFixed(2)}`
                  : "—"}
              </td>
              <td>{customer.OrderStatus ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}