import LoginForm from "./LoginForm";

const STEPS = [
  ["Request", "Customers raise a return within 30 days of delivery."],
  ["Collect", "Staff approve it and book a courier pickup."],
  ["Inspect", "Items are checked and restocked, refurbished, disposed or rejected."],
  ["Refund", "The refund is calculated from the reason and the item's condition."],
];

export default function LoginPage() {
  return (
    <main className="grid min-h-screen md:grid-cols-[minmax(320px,440px)_1fr]">
      <section className="hidden flex-col justify-between bg-[var(--sidebar)] p-10 text-[var(--sidebar-text)] md:flex">
        <div>
          <p className="text-[15px] font-semibold text-white">Reverse Logistics</p>
          <p className="text-xs">Returns management</p>
        </div>

        <ol className="space-y-6">
          {STEPS.map(([title, text], index) => (
            <li key={title} className="flex gap-4">
              <span className="mt-0.5 text-xs tabular-nums text-[#7d8582]">0{index + 1}</span>
              <div>
                <p className="font-medium text-white">{title}</p>
                <p className="text-[13px]">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-xs text-[#7d8582]">DBMS Level 3 Project · MySQL + MongoDB + Next.js</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[380px]">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
