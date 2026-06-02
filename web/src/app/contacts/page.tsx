"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { EmailLink, PageHeader, StatusBadge, btnSecondary, inputClass } from "@/components/ui";

type Contact = components["schemas"]["ContactResponse"];

export default function ContactsPage() {
  const [filters, setFilters] = useState({ name: "", email: "", company: "", title: "" });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const query: Record<string, string> = {};
    if (filters.name) query.name = filters.name;
    if (filters.email) query.email = filters.email;
    if (filters.company) query.company = filters.company;
    if (filters.title) query.title = filters.title;
    const { data } = await api.GET("/contacts", { params: { query } });
    setContacts(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Contacts" action={{ href: "/contacts/new", label: "+ New" }} />

      <form onSubmit={onSearch} className="mb-5 flex flex-wrap gap-2">
        <input
          placeholder="Name"
          className={inputClass}
          value={filters.name}
          onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          placeholder="Email"
          className={inputClass}
          value={filters.email}
          onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
        />
        <input
          placeholder="Company"
          className={inputClass}
          value={filters.company}
          onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
        />
        <input
          placeholder="Title"
          className={inputClass}
          value={filters.title}
          onChange={(e) => setFilters((f) => ({ ...f, title: e.target.value }))}
        />
        <button type="submit" className={btnSecondary}>
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  Loading…
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No contacts found.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                >
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${c.id}`} className="block font-medium text-[var(--color-accent)]">
                      {c.first_name} {c.last_name ?? ""}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {c.lifecycle_status ? (
                      <StatusBadge status={c.lifecycle_status} />
                    ) : (
                      <span className="text-[var(--color-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{c.title ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {c.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-2"><EmailLink email={c.email} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
