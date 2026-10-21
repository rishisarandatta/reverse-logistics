"use client";

import { useState } from "react";

export default function ReturnForm() {
  const [orderItemId, setOrderItemId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("Submitting...");

    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemId: Number(orderItemId),
          reason: Number(reasonId),
          comments,
        }),
      });

      const data = await response.json();
      setMessage(data.message || data.error || "Request completed");

      if (response.ok) {
        setOrderItemId("");
        setReasonId("");
        setComments("");
      }
    } catch {
      setMessage("Unable to connect to the server.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 space-y-4 rounded-xl border p-6">
      <h2 className="text-xl font-semibold">Register a Return</h2>

      <div>
        <label>Order Item ID</label>
        <input
          type="number"
          min="1"
          required
          value={orderItemId}
          onChange={(e) => setOrderItemId(e.target.value)}
          className="block w-full rounded border p-2"
        />
      </div>

      <div>
        <label>Return Reason</label>
        <select
          required
          value={reasonId}
          onChange={(e) => setReasonId(e.target.value)}
          className="block w-full rounded border p-2"
        >
          <option value="">Select reason</option>
          <option value="1">Damaged Product</option>
          <option value="2">Wrong Product</option>
          <option value="3">Defective Product</option>
          <option value="4">Other</option>
        </select>
      </div>

      <div>
        <label>Comments</label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="block w-full rounded border p-2"
        />
      </div>

      <button
        type="submit"
        className="rounded bg-blue-600 px-5 py-2 text-white"
      >
        Submit Return
      </button>

      <p>{message}</p>
    </form>
  );
}