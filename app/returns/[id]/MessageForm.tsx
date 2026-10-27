"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../../components/api";

export default function MessageForm({ returnId }: { returnId: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { ok, data } = await callApi(`/api/returns/${returnId}/events`, "POST", { message });
    setBusy(false);
    if (!ok) {
      setError(data.error ?? "Could not add the message.");
      return;
    }
    setMessage("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5 border-t border-[var(--border)] pt-4">
      <label className="label" htmlFor="message">Add a message</label>
      <textarea
        id="message"
        className="input"
        rows={2}
        value={message}
        maxLength={1000}
        required
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {error ? <p className="msg-error">{error}</p> : <span />}
        <button className="btn btn-sm" disabled={busy} type="submit">Post</button>
      </div>
    </form>
  );
}
