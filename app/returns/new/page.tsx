import Link from "next/link";
import ReturnForm from "../ReturnForm";
import PageHeader from "../../components/PageHeader";
import { isStaff, requirePageSession } from "@/lib/auth";
import { getLookups } from "@/lib/data/lookups";
import { listReturnableItems } from "@/lib/data/returns";

export default async function NewReturnPage() {
  const session = await requirePageSession();
  const [items, lookups] = await Promise.all([listReturnableItems(session), getLookups()]);

  return (
    <main className="page">
      <div className="mx-auto max-w-2xl">
        <Link href="/returns" className="link text-[13px]">← Back to returns</Link>
        <div className="mt-3">
          <PageHeader
            title="Request a return"
            description="Delivered items can be returned within 30 days of the order date."
          />
        </div>
        <ReturnForm items={items} reasons={lookups.reasons} showCustomer={isStaff(session)} />
      </div>
    </main>
  );
}
