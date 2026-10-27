const COLORS: Record<string, string> = {
  Requested: "badge-amber",
  Approved: "badge-blue",
  "Pickup Scheduled": "badge-blue",
  Scheduled: "badge-blue",
  "Picked Up": "badge-blue",
  Inspected: "badge-blue",
  Placed: "badge-amber",
  Shipped: "badge-blue",
  Delivered: "badge-green",
  Refunded: "badge-green",
  Processed: "badge-green",
  Closed: "",
  Rejected: "badge-red",
  Cancelled: "badge-red",
  Failed: "badge-red",
  Pending: "badge-amber",
};

export default function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="badge">—</span>;
  return <span className={`badge ${COLORS[status] ?? ""}`}>{status}</span>;
}
