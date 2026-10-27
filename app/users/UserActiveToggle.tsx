"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "../components/api";

export default function UserActiveToggle({
  userId,
  isActive,
  disabled,
}: {
  userId: number;
  isActive: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    const { ok, data } = await callApi(`/api/users/${userId}`, "PATCH", { isActive: !isActive });
    if (!ok) {
      setError(data.error ?? "Update failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className={`badge ${isActive ? "badge-green" : "badge-red"}`}>{isActive ? "Active" : "Disabled"}</span>
      {!disabled && (
        <button className="btn btn-secondary btn-sm" onClick={toggle}>
          {isActive ? "Disable" : "Enable"}
        </button>
      )}
      {error && <span className="msg-error">{error}</span>}
    </div>
  );
}
