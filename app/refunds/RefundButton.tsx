"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

const METHODS = ["Original Payment", "UPI", "Bank Transfer", "Store Credit"];

export default function RefundButton({ pickupId }: { pickupId: number }) {
  const router = useRouter();
  const [method, setMethod] = useState(METHODS[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refund() {
    setBusy(true);
    setError("");
    const { ok, data } = await callApi("/api/refunds", "POST", { pickupId, method });
    setBusy(false);
    if (!ok) {
      setError(data.error ?? "Refund failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          className="input"
          style={{ height: 30, width: 150 }}
          aria-label="Refund method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        >
          {METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <button className="btn btn-sm" disabled={busy} onClick={refund}>Refund</button>
      </div>
      {error && <p className="msg-error text-xs">{error}</p>}
    </div>
  );
}
