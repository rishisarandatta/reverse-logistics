import Link from "next/link";
import OrderForm from "../OrderForm";
import PageHeader from "../../components/PageHeader";
import { isStaff, requirePageSession } from "@/lib/auth";
import { listProducts } from "@/lib/data/catalog";
import { listCustomerOptions } from "@/lib/data/orders";

export default async function NewOrderPage() {
  const session = await requirePageSession();
  const staff = isStaff(session);
  const [products, customers] = await Promise.all([
    listProducts(),
    staff ? listCustomerOptions() : Promise.resolve([]),
  ]);

  return (
    <main className="page">
      <div className="mx-auto max-w-2xl">
        <Link href="/orders" className="link text-[13px]">← Back to orders</Link>
        <div className="mt-3">
          <PageHeader title={staff ? "New order" : "Place an order"} description="Prices are taken from the current catalogue." />
        </div>
        <OrderForm
          products={products.map((p) => ({ ProductID: p.ProductID, ProductName: p.ProductName, UnitPrice: p.UnitPrice }))}
          customers={customers.map((c) => ({ CustomerID: c.CustomerID, Name: c.Name }))}
          showCustomer={staff}
        />
      </div>
    </main>
  );
}
