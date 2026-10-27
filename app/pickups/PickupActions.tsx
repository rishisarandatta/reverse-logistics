"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

// Quick status updates for one pickup. Rescheduling needs a new date, so
// it links to the return page where the date can be chosen.
export default function PickupActions({
  pickupId,
  returnId,
  status,
}: {
  pickupId: number;
  returnId: number;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(next: string) {
    setBusy(true);
    setError("");
    const { ok, data } = await callApi(`/api/pickups/${pickupId}`, "PATCH", { status: next });
    setBusy(false);
    if (!ok) {
      setError(data.error ?? "Update failed.");
      return;
    }
    router.refresh();
  }

  if (status === "Scheduled") {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <button className="btn btn-sm" disabled={busy} onClick={() => update("Picked Up")}>Collected</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => update("Failed")}>Failed</button>
        </div>
        {error && <p className="msg-error text-xs">{error}</p>}
      </div>
    );
  }

  if (status === "Failed" || status === "Cancelled") {
    return <Link href={`/returns/${returnId}`} className="btn btn-secondary btn-sm">Reschedule</Link>;
  }

  return null;
}
