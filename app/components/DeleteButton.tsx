"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "./api";

// Calls DELETE on the given API route. If the database refuses (for
// example a foreign key RESTRICT), the reason is shown next to the button.
export default function DeleteButton({ url, confirmText }: { url: string; confirmText: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    const { ok, data } = await callApi(url, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data.error ?? "Delete failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>
        Delete
      </button>
      {error && <p className="msg-error mt-1 max-w-56 text-right text-xs">{error}</p>}
    </div>
  );
}
