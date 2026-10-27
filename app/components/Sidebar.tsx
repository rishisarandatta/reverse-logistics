import Link from "next/link";
import type { Role, Session } from "@/lib/auth";
import NavLinks, { type NavGroup } from "./NavLinks";
import LogoutButton from "./LogoutButton";

const GROUPS: (NavGroup & { roles: Role[] })[] = [
  {
    label: "Overview",
    roles: ["Admin", "Staff", "Customer"],
    links: [
      { href: "/", label: "Home", roles: ["Admin", "Staff", "Customer"] },
      { href: "/dashboard", label: "Analytics", roles: ["Admin", "Staff"] },
    ],
  },
  {
    label: "Operations",
    roles: ["Admin", "Staff", "Customer"],
    links: [
      { href: "/returns", label: "Returns", roles: ["Admin", "Staff"] },
      { href: "/returns", label: "My returns", roles: ["Customer"] },
      { href: "/pickups", label: "Pickups", roles: ["Admin", "Staff"] },
      { href: "/orders", label: "Orders", roles: ["Admin", "Staff"] },
      { href: "/orders", label: "My orders", roles: ["Customer"] },
      { href: "/refunds", label: "Refunds", roles: ["Admin", "Staff"] },
    ],
  },
  {
    label: "Records",
    roles: ["Admin", "Staff", "Customer"],
    links: [
      { href: "/customers", label: "Customers", roles: ["Admin", "Staff"] },
      { href: "/products", label: "Products", roles: ["Admin", "Staff", "Customer"] },
      { href: "/search", label: "Search", roles: ["Admin", "Staff"] },
    ],
  },
  {
    label: "Admin",
    roles: ["Admin"],
    links: [{ href: "/users", label: "User accounts", roles: ["Admin"] }],
  },
];

// Navigation is filtered by role, so each user only sees what they can use.
export default function Sidebar({ session }: { session: Session }) {
  const groups = GROUPS.filter((group) => group.roles.includes(session.role))
    .map((group) => ({
      label: group.label,
      links: group.links
        .filter((link) => link.roles?.includes(session.role))
        .map(({ href, label }) => ({ href, label })),
    }))
    .filter((group) => group.links.length > 0);

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        Reverse Logistics
        <span>Returns management</span>
      </Link>
      <NavLinks groups={groups} />
      <div className="sidebar-user">
        <div>
          <strong>{session.username}</strong>
          <div className="text-xs">{session.role}</div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
