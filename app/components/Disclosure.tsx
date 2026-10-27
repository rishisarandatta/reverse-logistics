"use client";

import { useState } from "react";

// A button that reveals a form panel, so create-forms do not push the
// main table down the page.
export default function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {label}
        </button>
      ) : (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{label}</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
