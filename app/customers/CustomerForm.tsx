"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

const EMPTY = { name: "", email: "", phone: "", address: "", customerType: "Regular" };

// Format checks (email, 10-digit phone, customer type) are deliberately left
// to the database CHECK constraints so their error messages are visible.
export default function CustomerForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await callApi("/api/customers", "POST", form);
    setBusy(false);
    setMessage({ ok, text: (ok ? data.message : data.error) ?? "" });
    if (ok) {
      setForm(EMPTY);
      router.refresh();
    }
  }

  const input = (key: keyof typeof EMPTY, label: string) => (
    <div>
      <label className="label" htmlFor={key}>{label}</label>
      <input id={key} className="input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="form-grid">
        {input("name", "Name")}
        {input("email", "Email")}
        {input("phone", "Phone")}
        {input("address", "Address")}
        <div>
          <label className="label" htmlFor="customerType">Type</label>
          <select id="customerType" className="input" value={form.customerType}
            onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
            <option>Regular</option>
            <option>Premium</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn" disabled={busy} type="submit">Save customer</button>
        {message && <p className={message.ok ? "msg-ok" : "msg-error"}>{message.text}</p>}
      </div>
    </form>
  );
}
