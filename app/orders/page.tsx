import Link from "next/link";
import OrderStatusSelect from "./OrderStatusSelect";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { isStaff, requirePageSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { listOrderLines, type OrderLine } from "@/lib/data/orders";

export default async function OrdersPage() {
  const session = await requirePageSession();
  const staff = isStaff(session);
  const lines = await listOrderLines(session);

  // Group order lines (one row per item from OrderDetailsView) by order.
  const orders = new Map<number, OrderLine[]>();
  for (const line of lines) {
    orders.set(line.OrderID, [...(orders.get(line.OrderID) ?? []), line]);
  }

  return (
    <main className="page">
      <PageHeader
        title={staff ? "Orders" : "My orders"}
        description={staff ? "All customer orders. Change the status as orders are shipped and delivered." : "Orders you have placed."}
      >
        <Link href="/orders/new" className="btn">{staff ? "New order" : "Place an order"}</Link>
      </PageHeader>

      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                {staff && <th>Customer</th>}
                <th>Items</th>
                <th>Payment</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...orders.values()].map((items) => {
                const order = items[0];
                return (
                  <tr key={order.OrderID}>
                    <td className="font-medium">#{order.OrderID}</td>
                    <td className="whitespace-nowrap">{formatDate(order.OrderDate)}</td>
                    {staff && <td>{order.CustomerName}</td>}
                    <td>
                      {items.map((item) => (
                        <div key={item.OrderItemID}>
                          {item.ProductName}
                          <span className="muted"> × {item.Quantity}</span>
                        </div>
                      ))}
                    </td>
                    <td>{order.PaymentMethod}</td>
                    <td className="num">{formatCurrency(order.TotalAmount)}</td>
                    <td>
                      {staff ? (
                        <OrderStatusSelect orderId={order.OrderID} status={order.OrderStatus} />
                      ) : (
                        <StatusBadge status={order.OrderStatus} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {orders.size === 0 && (
                <tr><td colSpan={staff ? 7 : 6} className="table-empty">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
