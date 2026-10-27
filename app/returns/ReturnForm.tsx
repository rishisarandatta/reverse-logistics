"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

interface Item {
  OrderItemID: number;
  OrderID: number;
  OrderDate: string;
  CustomerName: string;
  ProductName: string;
  ReturnableQty: number;
  LastReturnDate: string;
}

interface Reason {
  ReturnReasonID: number;
  ReasonName: string;
  IsSellerFault: number;
}

export default function ReturnForm({
  items,
  reasons,
  showCustomer,
}: {
  items: Item[];
  reasons: Reason[];
  showCustomer: boolean;
}) {
  const router = useRouter();
  const [orderItemId, setOrderItemId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = items.find((item) => String(item.OrderItemID) === orderItemId);
  const reason = reasons.find((r) => String(r.ReturnReasonID) === reasonId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { ok, data } = await callApi<{ returnId?: number }>("/api/returns", "POST", {
      orderItemId: Number(orderItemId),
      reasonId: Number(reasonId),
      quantity: Number(quantity),
      comments,
    });

    if (!ok) {
      setBusy(false);
      setError(data.error ?? "Failed to register the return.");
      return;
    }
    router.push(`/returns/${data.returnId}`);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="card">
        <p className="font-medium">Nothing to return right now</p>
        <p className="mt-1 text-[var(--muted)]">
          Only delivered items ordered in the last 30 days, and not already returned, can be returned.
        </p>
        <Link href="/orders" className="btn btn-secondary mt-4">View orders</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      <div>
        <label className="label" htmlFor="orderItem">Item</label>
        <select
          id="orderItem"
          required
          value={orderItemId}
          onChange={(e) => {
            setOrderItemId(e.target.value);
            setQuantity("1");
          }}
          className="input"
        >
          <option value="">Choose an item from your orders</option>
          {items.map((item) => (
            <option key={item.OrderItemID} value={item.OrderItemID}>
              {item.ProductName} (order #{item.OrderID}{showCustomer ? `, ${item.CustomerName}` : ""})
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Returnable until {selected.LastReturnDate} · up to {selected.ReturnableQty} unit{selected.ReturnableQty > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="reason">Reason</label>
          <select id="reason" required value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="input">
            <option value="">Choose a reason</option>
            {reasons.map((r) => (
              <option key={r.ReturnReasonID} value={r.ReturnReasonID}>{r.ReasonName}</option>
            ))}
          </select>
          {reason && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {reason.IsSellerFault
                ? "Our mistake: you will get a full refund."
                : "The refund depends on the item's condition after inspection."}
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            type="number"
            min="1"
            max={selected?.ReturnableQty}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="comments">What is wrong with it? <span className="text-[var(--faint)]">(optional)</span></label>
        <textarea
          id="comments"
          maxLength={500}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="input"
          rows={3}
        />
      </div>

      {error && <p className="notice">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Submitting…" : "Submit return request"}
        </button>
        <Link href="/returns" className="btn btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
