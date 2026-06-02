"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/LogoutButton";

// Tasks is the daily driver — pinned to the top. The rest are in workflow order.
const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Tasks", href: "/tasks" },
  { label: "Dashboard", href: "/" },
  { label: "Leads", href: "/leads" },
  { label: "Companies", href: "/companies" },
  { label: "Contacts", href: "/contacts" },
  { label: "Import", href: "/import" },
  { label: "Activities", href: "/activities" },
  { label: "Chains", href: "/chains" },
  { label: "Sequences", href: "/sequences" },
  { label: "Deals", href: "/deals" },
  { label: "Pipeline settings", href: "/settings/pipeline" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LeftNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-8 flex items-center gap-2 px-2">
        <svg
          viewBox="0 0 80 80"
          width="20"
          height="20"
          fill="#3B5FE5"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect x="4" y="24" width="12" height="32" rx="6" opacity="0.3" />
          <rect x="24" y="14" width="12" height="52" rx="6" opacity="0.55" />
          <rect x="44" y="4" width="12" height="72" rx="6" opacity="1" />
          <rect x="64" y="14" width="12" height="52" rx="6" opacity="0.55" />
        </svg>
        <span
          className="text-base tracking-tight"
          style={{ fontFamily: "var(--font-outfit)", fontWeight: 600 }}
        >
          garbos
        </span>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[var(--radius-base)] px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white font-medium text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:bg-white hover:text-[var(--color-fg)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-6">
        <LogoutButton />
      </div>
    </aside>
  );
}
