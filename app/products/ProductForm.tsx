"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

export default function ProductForm({ categories }: { categories: { CategoryID: number; CategoryName: string }[] }) {
  const router = useRouter();
  const empty = { productName: "", sku: "", unitPrice: "", categoryId: String(categories[0]?.CategoryID ?? "") };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await callApi("/api/products", "POST", form);
    setBusy(false);
    setMessage({ ok, text: (ok ? data.message : data.error) ?? "" });
    if (ok) {
      setForm(empty);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="form-grid">
        <div>
          <label className="label" htmlFor="productName">Name</label>
          <input id="productName" className="input" required value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="sku">SKU</label>
          <input id="sku" className="input" required value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="unitPrice">Price (₹)</label>
          <input id="unitPrice" className="input" type="number" step="0.01" required value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="categoryId">Category</label>
          <select id="categoryId" className="input" value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn" disabled={busy} type="submit">Save product</button>
        {message && <p className={message.ok ? "msg-ok" : "msg-error"}>{message.text}</p>}
      </div>
    </form>
  );
}
