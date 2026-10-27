"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

const EMPTY_REGISTRATION = { name: "", email: "", phone: "", address: "", username: "", password: "" };

const DEMO_ACCOUNTS = [
  { role: "Admin", username: "admin", password: "admin123" },
  { role: "Staff", username: "staff", password: "staff123" },
  { role: "Customer", username: "rahul", password: "customer123" },
];

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState(EMPTY_REGISTRATION);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const { ok, data } =
      mode === "login"
        ? await callApi("/api/auth/login", "POST", { username, password })
        : await callApi("/api/auth/register", "POST", registration);

    if (ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setError(data.error ?? "Something went wrong.");
    setBusy(false);
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setError("");
  }

  const field = (key: keyof typeof EMPTY_REGISTRATION, label: string, type = "text", required = true) => (
    <div>
      <label className="label" htmlFor={key}>
        {label} {!required && <span className="text-[var(--faint)]">(optional)</span>}
      </label>
      <input
        id={key}
        className="input"
        type={type}
        required={required}
        value={registration[key]}
        onChange={(e) => setRegistration({ ...registration, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div>
      <h1 className="text-[22px] font-semibold">{mode === "login" ? "Sign in" : "Create a customer account"}</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        {mode === "login" ? "Use your account to manage returns." : "Track your orders and request returns."}
      </p>

      <form onSubmit={submit} className="space-y-4">
        {mode === "login" ? (
          <>
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input
                id="username"
                className="input"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            {field("name", "Full name")}
            {field("email", "Email", "email")}
            <div className="grid grid-cols-2 gap-3">
              {field("phone", "Phone", "tel", false)}
              {field("username", "Username")}
            </div>
            {field("address", "Address", "text", false)}
            {field("password", "Password (6+ characters)", "password")}
          </>
        )}

        {error && <p className="notice">{error}</p>}

        <button type="submit" className="btn w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-[13px] text-[var(--muted)]">
        {mode === "login" ? (
          <>
            New customer?{" "}
            <button type="button" className="font-medium text-[var(--accent)] hover:underline" onClick={() => switchMode("register")}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already registered?{" "}
            <button type="button" className="font-medium text-[var(--accent)] hover:underline" onClick={() => switchMode("login")}>
              Sign in
            </button>
          </>
        )}
      </p>

      {mode === "login" && (
        <div className="mt-8 border-t border-[var(--border)] pt-5">
          <p className="mb-2 text-xs text-[var(--muted)]">Demo accounts. Click one to fill in the form.</p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                className="rounded-md border border-[var(--border-strong)] bg-white px-2 py-2 text-left hover:bg-[var(--surface-muted)]"
                onClick={() => {
                  setUsername(account.username);
                  setPassword(account.password);
                  setError("");
                }}
              >
                <span className="block text-xs text-[var(--muted)]">{account.role}</span>
                <span className="font-medium">{account.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
