"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";
import { formatCurrency } from "@/lib/format";

interface Product {
  ProductID: number;
  ProductName: string;
  UnitPrice: number;
}

interface Customer {
  CustomerID: number;
  Name: string;
}

export default function OrderForm({
  products,
  customers,
  showCustomer,
}: {
  products: Product[];
  customers: Customer[];
  showCustomer: boolean;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [items, setItems] = useState([{ productId: "", quantity: "1" }]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const priceOf = (productId: string) => products.find((p) => String(p.ProductID) === productId)?.UnitPrice ?? 0;
  const total = items.reduce((sum, item) => sum + priceOf(item.productId) * Number(item.quantity || 0), 0);

  const update = (index: number, change: Partial<(typeof items)[number]>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...change } : item)));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { ok, data } = await callApi("/api/orders", "POST", {
      customerId: showCustomer ? Number(customerId) : undefined,
      paymentMethod,
      items: items.map((item) => ({ productId: Number(item.productId), quantity: Number(item.quantity) })),
    });

    if (!ok) {
      setBusy(false);
      setError(data.error ?? "Failed to create the order.");
      return;
    }
    router.push("/orders");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {showCustomer && (
          <div>
            <label className="label" htmlFor="customer">Customer</label>
            <select id="customer" className="input" required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Choose a customer</option>
              {customers.map((c) => <option key={c.CustomerID} value={c.CustomerID}>{c.Name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="payment">Payment method</label>
          <select id="payment" className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="UPI">UPI</option>
            <option value="Card">Card</option>
            <option value="NetBanking">Net banking</option>
            <option value="Cash">Cash on delivery</option>
          </select>
        </div>
      </div>

      <div>
        <p className="label">Items</p>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="grid items-center gap-2 grid-cols-[1fr_80px_auto]">
              <select className="input" required value={item.productId} onChange={(e) => update(i, { productId: e.target.value })}>
                <option value="">Choose a product</option>
                {products.map((p) => (
                  <option key={p.ProductID} value={p.ProductID}>
                    {p.ProductName} · {formatCurrency(p.UnitPrice)}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="number"
                min="1"
                required
                aria-label="Quantity"
                value={item.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                aria-label="Remove item"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setItems([...items, { productId: "", quantity: "1" }])}>
          + Add another item
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="muted">Total</span>
        <span className="text-lg font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Placing order…" : "Place order"}</button>
        <Link href="/orders" className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
