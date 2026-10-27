import { formatDate } from "@/lib/format";

const STEPS = ["Requested", "Approved", "Pickup Scheduled", "Picked Up", "Inspected", "Refunded"];

interface Step {
  label: string;
  state: "done" | "current" | "todo" | "stopped";
  when?: string;
}

// Shows where a return is in the workflow, built from the audit history.
export default function ReturnProgress({
  status,
  history,
  dates = {},
}: {
  status: string;
  history: { NewStatus: string; ChangedAt: string }[];
  // Business dates (return, pickup, inspection, refund) shown instead of
  // the audit timestamp when known.
  dates?: Record<string, string | null>;
}) {
  const reachedAt = new Map<string, string>();
  for (const h of history) if (!reachedAt.has(h.NewStatus)) reachedAt.set(h.NewStatus, h.ChangedAt);
  for (const [label, date] of Object.entries(dates)) {
    if (date && reachedAt.has(label)) reachedAt.set(label, date);
  }

  let labels = STEPS;
  let stopped: string | null = null;

  if (status === "Rejected") {
    const lastReached = Math.max(...STEPS.map((s, i) => (reachedAt.has(s) ? i : -1)));
    labels = STEPS.slice(0, lastReached + 1);
    stopped = "Rejected";
  } else if (status === "Closed" && !reachedAt.has("Refunded")) {
    labels = STEPS.slice(0, 5);
    stopped = "Closed, no refund";
  }

  const steps: Step[] = labels.map((label) => ({
    label,
    state: label === status ? "current" : reachedAt.has(label) ? "done" : "todo",
    when: reachedAt.get(label),
  }));

  // A pickup that failed sends the return back to Approved: later steps
  // that were reached earlier are no longer complete.
  const currentIndex = labels.indexOf(status);
  if (currentIndex >= 0) {
    for (let i = currentIndex + 1; i < steps.length; i++) steps[i].state = "todo";
  }

  if (stopped) steps.push({ label: stopped, state: "stopped", when: reachedAt.get(status) });

  return (
    <div className="progress">
      {steps.map((step) => (
        <div key={step.label} className={`progress-step ${step.state}`}>
          <div className="bar" />
          {step.label}
          <span className="when">{step.when && step.state !== "todo" ? formatDate(step.when.slice(0, 10)) : " "}</span>
        </div>
      ))}
    </div>
  );
}
