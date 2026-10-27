import UserForm from "./UserForm";
import UserActiveToggle from "./UserActiveToggle";
import Disclosure from "../components/Disclosure";
import PageHeader from "../components/PageHeader";
import { requirePageSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listUsers } from "@/lib/data/catalog";
import { listCustomerOptions } from "@/lib/data/orders";

export default async function UsersPage() {
  const session = await requirePageSession("Admin");
  const [users, customers] = await Promise.all([listUsers(), listCustomerOptions()]);

  return (
    <main className="page">
      <PageHeader title="User accounts" description="Who can sign in, and what they can do." />

      <Disclosure label="Create account">
        <UserForm customers={customers.map((c) => ({ CustomerID: c.CustomerID, Name: c.Name }))} />
      </Disclosure>

      <div className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Username</th><th>Role</th><th>Linked customer</th><th>Created</th><th>Access</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.UserID}>
                  <td className="font-medium">
                    {u.Username}
                    {u.UserID === session.userId && <span className="muted"> (you)</span>}
                  </td>
                  <td>{u.Role}</td>
                  <td>{u.CustomerName ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(u.CreatedAt.slice(0, 10))}</td>
                  <td>
                    <UserActiveToggle userId={u.UserID} isActive={Boolean(u.IsActive)} disabled={u.UserID === session.userId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
