"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

export default function UserForm({ customers }: { customers: { CustomerID: number; Name: string }[] }) {
  const router = useRouter();
  const empty = { username: "", password: "", role: "Staff", customerId: "" };
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await callApi("/api/users", "POST", {
      ...form,
      customerId: form.role === "Customer" ? form.customerId : null,
    });
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
          <label className="label" htmlFor="username">Username</label>
          <input id="username" className="input" required value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (6+ characters)</label>
          <input id="password" type="password" className="input" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="Staff">Staff: handles returns</option>
            <option value="Admin">Admin: full access</option>
            <option value="Customer">Customer</option>
          </select>
        </div>
        {form.role === "Customer" && (
          <div>
            <label className="label" htmlFor="customerId">Customer record</label>
            <select id="customerId" className="input" value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Choose a customer</option>
              {customers.map((c) => <option key={c.CustomerID} value={c.CustomerID}>{c.Name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn" disabled={busy} type="submit">Create account</button>
        {message && <p className={message.ok ? "msg-ok" : "msg-error"}>{message.text}</p>}
      </div>
    </form>
  );
}
