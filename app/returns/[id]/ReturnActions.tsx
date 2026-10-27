"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import checklists from "@/lib/inspection-checklists.json";
import { callApi } from "../../components/api";
import { formatCurrency, humanizeKey } from "@/lib/format";

interface Props {
  returnId: number;
  status: string;
  pickupId: number | null;
  pickupStatus: string | null;
  category: string;
  customerAddress: string | null;
  refundPreview: number | null;
  couriers: { CourierID: number; CourierName: string }[];
  warehouses: { WarehouseID: number; WarehouseName: string }[];
}

const CONDITIONS = ["Like New", "Good", "Fair", "Damaged", "Defective"];
const DISPOSITIONS = ["Restock", "Refurbish", "Dispose", "Reject"];
const DISPOSAL_METHODS = ["Recycle", "E-Waste", "Landfill", "Donate"];
const REFUND_METHODS = ["Original Payment", "UPI", "Bank Transfer", "Store Credit"];
const DISPOSITION_LABELS: Record<string, string> = {
  Restock: "Restock: back into sellable stock",
  Refurbish: "Refurbish: repair, then resell",
  Dispose: "Dispose: recycle or scrap",
  Reject: "Reject: return not accepted, no refund",
};
const today = () => new Date().toISOString().slice(0, 10);

// Shows the next workflow step for the return's current status. The
// database decides whether each step is allowed (triggers / procedures);
// any rejection message is shown as-is.
export default function ReturnActions(props: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(url: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setMessage(null);
    const { ok, data } = await callApi(url, method, body);
    setBusy(false);
    setMessage({ ok, text: (ok ? data.message : data.error) ?? (ok ? "Done." : "Failed.") });
    if (ok) router.refresh();
  }

  const { status, pickupStatus } = props;
  const pickupNeedsReschedule = status === "Approved" && props.pickupId && pickupStatus !== "Scheduled";

  let title = "No action needed";
  let hint = "This return is finished.";
  let content: React.ReactNode = null;

  if (status === "Requested") {
    title = "Review this request";
    hint = "Approve it to arrange a pickup, or reject it.";
    content = <Review {...props} busy={busy} run={run} />;
  } else if (status === "Approved" && !props.pickupId) {
    title = "Book a pickup";
    hint = "Choose a courier and a collection date.";
    content = <SchedulePickup {...props} busy={busy} run={run} />;
  } else if (pickupNeedsReschedule) {
    title = "Reschedule the pickup";
    hint = `The last pickup attempt was marked ${pickupStatus?.toLowerCase()}.`;
    content = <Reschedule {...props} busy={busy} run={run} />;
  } else if (status === "Pickup Scheduled") {
    title = "Confirm the pickup";
    hint = "Update this once the courier reports back.";
    content = (
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy} onClick={() => run(`/api/pickups/${props.pickupId}`, "PATCH", { status: "Picked Up" })}>
          Item collected
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => run(`/api/pickups/${props.pickupId}`, "PATCH", { status: "Failed" })}>
          Pickup failed
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => run(`/api/pickups/${props.pickupId}`, "PATCH", { status: "Cancelled" })}>
          Cancel pickup
        </button>
      </div>
    );
  } else if (status === "Picked Up") {
    title = "Record the inspection";
    hint = "Check the item and decide what happens to it.";
    content = <InspectionForm {...props} busy={busy} run={run} />;
  } else if (status === "Inspected") {
    title = "Issue the refund";
    hint = "The amount is calculated by the refund policy.";
    content = <RefundForm {...props} busy={busy} run={run} />;
  }

  const active = content !== null;

  return (
    <section className="card" style={active ? { borderColor: "var(--accent)" } : undefined}>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mb-4 mt-0.5 text-[var(--muted)]">{hint}</p>
      {content}
      {message && <p className={`mt-4 ${message.ok ? "msg-ok" : "notice"}`}>{message.text}</p>}
    </section>
  );
}

type StepProps = Props & {
  busy: boolean;
  run: (url: string, method: "POST" | "PATCH", body: unknown) => Promise<void>;
};

function Review({ returnId, busy, run }: StepProps) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1">
        <label className="label" htmlFor="note">Note (optional)</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(`/api/returns/${returnId}`, "PATCH", { action: "approve", note })}>
        Approve
      </button>
      <button className="btn btn-danger" disabled={busy} onClick={() => run(`/api/returns/${returnId}`, "PATCH", { action: "reject", note })}>
        Reject
      </button>
    </div>
  );
}

function SchedulePickup({ returnId, couriers, customerAddress, busy, run }: StepProps) {
  const [courierId, setCourierId] = useState(String(couriers[0]?.CourierID ?? ""));
  const [pickupDate, setPickupDate] = useState(today());
  const [address, setAddress] = useState(customerAddress ?? "");

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("/api/pickups", "POST", { returnId, courierId: Number(courierId), pickupDate, pickupAddress: address });
      }}
    >
      <div>
        <label className="label" htmlFor="courier">Courier</label>
        <select id="courier" className="input" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
          {couriers.map((c) => <option key={c.CourierID} value={c.CourierID}>{c.CourierName}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pickupDate">Pickup date</label>
        <input id="pickupDate" type="date" className="input" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} required />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="address">Pickup address</label>
        <input id="address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} required />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button className="btn" disabled={busy} type="submit">Schedule pickup</button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => run(`/api/returns/${returnId}`, "PATCH", { action: "reject" })}
        >
          Reject return
        </button>
      </div>
    </form>
  );
}

function Reschedule({ pickupId, busy, run }: StepProps) {
  const [pickupDate, setPickupDate] = useState(today());
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="newDate">New pickup date</label>
        <input id="newDate" type="date" className="input" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
      </div>
      <button className="btn" disabled={busy} onClick={() => run(`/api/pickups/${pickupId}`, "PATCH", { status: "Scheduled", pickupDate })}>
        Reschedule pickup
      </button>
    </div>
  );
}

function InspectionForm({ returnId, category, warehouses, busy, run }: StepProps) {
  const template = (checklists as Record<string, { checklist: string[]; attributes: string[] }>)[category] ?? {
    checklist: ["Item matches order", "No physical damage"],
    attributes: [],
  };

  const [condition, setCondition] = useState("Good");
  const [score, setScore] = useState("8");
  const [checks, setChecks] = useState(template.checklist.map((item) => ({ item, passed: true, note: "" })));
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [defects, setDefects] = useState<{ type: string; severity: string; location: string }[]>([]);
  const [remarks, setRemarks] = useState("");
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState("Restock");
  const [warehouseId, setWarehouseId] = useState(String(warehouses[0]?.WarehouseID ?? ""));
  const [detail, setDetail] = useState("");
  const [disposalMethod, setDisposalMethod] = useState("Recycle");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    run("/api/inspections", "POST", {
      returnId,
      condition,
      conditionScore: Number(score),
      remarks,
      notes,
      disposition,
      warehouseId: disposition === "Reject" ? null : Number(warehouseId),
      detail,
      disposalMethod: disposition === "Dispose" ? disposalMethod : null,
      checklist: checks.map((c) => ({ item: c.item, passed: c.passed, ...(c.note ? { note: c.note } : {}) })),
      attributes: Object.fromEntries(
        Object.entries(attributes)
          .filter(([, v]) => v.trim() !== "")
          .map(([k, v]) => [k, Number.isFinite(Number(v)) ? Number(v) : v.trim()])
      ),
      defects: defects.filter((d) => d.type.trim()),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 text-[13px] font-semibold">1. Condition</legend>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label className="label" htmlFor="condition">Overall condition</label>
            <select id="condition" className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="score">Score (1–10)</label>
            <input id="score" type="number" min="1" max="10" className="input" value={score} onChange={(e) => setScore(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="remarks">Summary remark</label>
          <input id="remarks" className="input" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)}
            placeholder="One line, shown in lists and search" />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">2. {category} checklist</legend>
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <table>
            <tbody>
              {checks.map((check, i) => (
                <tr key={check.item}>
                  <td className="w-[40%]">{check.item}</td>
                  <td className="w-[140px]">
                    <div className="inline-flex overflow-hidden rounded-md border border-[var(--border-strong)] text-xs">
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          onClick={() => setChecks(checks.map((c, j) => (j === i ? { ...c, passed: value } : c)))}
                          className={`px-3 py-1 ${
                            check.passed === value
                              ? value ? "bg-[#e6f2e8] text-[#2b6a3a]" : "bg-[#fbe9e7] text-[#a12a1f]"
                              : "bg-white text-[var(--muted)]"
                          }`}
                        >
                          {value ? "Pass" : "Fail"}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      className="input"
                      placeholder={check.passed ? "Note (optional)" : "What failed?"}
                      value={check.note}
                      onChange={(e) => setChecks(checks.map((c, j) => (j === i ? { ...c, note: e.target.value } : c)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {template.attributes.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {template.attributes.map((attribute) => (
              <div key={attribute}>
                <label className="label" htmlFor={attribute}>{humanizeKey(attribute)}</label>
                <input
                  id={attribute}
                  className="input"
                  value={attributes[attribute] ?? ""}
                  onChange={(e) => setAttributes({ ...attributes, [attribute]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-semibold">3. Defects and notes</legend>
        {defects.map((defect, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
            <input className="input" placeholder="Defect, e.g. scratch" value={defect.type}
              onChange={(e) => setDefects(defects.map((d, j) => (j === i ? { ...d, type: e.target.value } : d)))} />
            <select className="input" value={defect.severity}
              onChange={(e) => setDefects(defects.map((d, j) => (j === i ? { ...d, severity: e.target.value } : d)))}>
              <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
            </select>
            <input className="input" placeholder="Where" value={defect.location}
              onChange={(e) => setDefects(defects.map((d, j) => (j === i ? { ...d, location: e.target.value } : d)))} />
            <button type="button" className="btn btn-secondary" onClick={() => setDefects(defects.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDefects([...defects, { type: "", severity: "minor", location: "" }])}>
          + Add defect
        </button>
        <div className="pt-2">
          <label className="label" htmlFor="notes">Inspector notes</label>
          <textarea id="notes" className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">4. Outcome</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="disposition">What happens to the item</label>
          <select id="disposition" className="input" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
            {DISPOSITIONS.map((d) => <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>)}
          </select>
        </div>
        {disposition !== "Reject" && (
          <div>
            <label className="label" htmlFor="warehouse">Warehouse</label>
            <select id="warehouse" className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => <option key={w.WarehouseID} value={w.WarehouseID}>{w.WarehouseName}</option>)}
            </select>
          </div>
        )}
        {disposition === "Dispose" && (
          <div>
            <label className="label" htmlFor="disposalMethod">Disposal method</label>
            <select id="disposalMethod" className="input" value={disposalMethod} onChange={(e) => setDisposalMethod(e.target.value)}>
              {DISPOSAL_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        )}
        {disposition !== "Restock" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="detail">
              {disposition === "Refurbish" ? "What needs repairing" : "Reason"}
            </label>
            <input id="detail" className="input" maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
        )}
      </div>
      </fieldset>

      <button className="btn" disabled={busy} type="submit">{busy ? "Saving…" : "Save inspection"}</button>
    </form>
  );
}

function RefundForm({ pickupId, refundPreview, busy, run }: StepProps) {
  const [method, setMethod] = useState(REFUND_METHODS[0]);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor="method">Refund method</label>
        <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          {REFUND_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <button className="btn" disabled={busy} onClick={() => run("/api/refunds", "POST", { pickupId, method })}>
        Process refund of {formatCurrency(refundPreview ?? 0)}
      </button>
    </div>
  );
}
