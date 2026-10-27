"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

const STATUSES = ["Placed", "Shipped", "Delivered", "Cancelled"];

export default function OrderStatusSelect({ orderId, status }: { orderId: number; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [error, setError] = useState("");

  async function change(next: string) {
    setValue(next);
    setError("");
    const { ok, data } = await callApi(`/api/orders/${orderId}`, "PATCH", { status: next });
    if (!ok) {
      setValue(status);
      setError(data.error ?? "Update failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <select
        className="input btn-sm"
        style={{ height: 30, width: 130 }}
        aria-label={`Status of order ${orderId}`}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      {error && <p className="msg-error">{error}</p>}
    </div>
  );
}
