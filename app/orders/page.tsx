import OrderForm from "./OrderForm";
import pool from "@/lib/db";
export default async function OrdersPage() {
  const [orders] = await pool.query(`
    SELECT
      o.OrderID,
      o.CustomerID,
      o.OrderDate,
      o.TotalAmount,
      o.PaymentMethod,
      o.OrderStatus,
      oi.ProductID,
      p.ProductName,
      oi.Quantity,
      oi.UnitPrice
    FROM ORDERS o
    LEFT JOIN ORDER_ITEM oi
      ON o.OrderID = oi.OrderID
    LEFT JOIN PRODUCT p
      ON oi.ProductID = p.ProductID
    ORDER BY o.OrderID, oi.OrderItemID
  `);

  const rows = orders as any[];

  return (
    <main>
      <h1>Order Management</h1>
      <OrderForm />
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Customer ID</th>
            <th>Order Date</th>
            <th>Total Amount</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Product</th>
            <th>Quantity</th>
            <th>Unit Price</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((o, i) => (
            <tr key={`${o.OrderID}-${o.ProductID}-${i}`}>
              <td>{o.OrderID}</td>
              <td>{o.CustomerID}</td>
              <td>
                {o.OrderDate
                  ? new Date(o.OrderDate).toLocaleDateString("en-IN")
                  : "-"}
              </td>
              <td>
                {o.TotalAmount != null
                  ? `₹${Number(o.TotalAmount).toFixed(2)}`
                  : "-"}
              </td>
              <td>{o.PaymentMethod || "-"}</td>
              <td>{o.OrderStatus || "-"}</td>
              <td>{o.ProductName || "-"}</td>
              <td>{o.Quantity ?? "-"}</td>
              <td>
                {o.UnitPrice != null
                  ? `₹${Number(o.UnitPrice).toFixed(2)}`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}