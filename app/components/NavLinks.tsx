"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/session";

export interface NavGroup {
  label: string;
  links: { href: string; label: string; roles?: Role[] }[];
}

export default function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="sidebar-nav">
      {groups.map((group) => (
        <div key={group.label} className="contents">
          <div className="sidebar-group">{group.label}</div>
          {group.links.map((link) => (
            <Link
              key={link.href + link.label}
              href={link.href}
              className={`sidebar-link ${isActive(link.href) ? "active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
