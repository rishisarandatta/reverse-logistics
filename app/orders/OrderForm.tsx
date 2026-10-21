"use client";

import { useState } from "react";

export default function OrderForm() {
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("Creating order...");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: Number(customerId),
          paymentMethod,
          items: [
            {
              productId: Number(productId),
              quantity: Number(quantity),
            },
          ],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Failed to create order.");
        return;
      }

      setMessage("Order created successfully!");
      window.location.reload();
    } catch {
      setMessage("Could not connect to the server.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create New Order</h2>

      <label>Customer ID</label>
      <input
        type="number"
        value={customerId}
        onChange={(e) => setCustomerId(e.target.value)}
        required
        min="1"
      />

      <label>Product ID</label>
      <input
        type="number"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        required
        min="1"
      />

      <label>Quantity</label>
      <input
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
        min="1"
      />

      <label>Payment Method</label>
      <select
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
      >
        <option value="Cash">Cash</option>
        <option value="UPI">UPI</option>
        <option value="Card">Card</option>
      </select>

      <button type="submit">Create Order</button>

      <p>{message}</p>
    </form>
  );
}