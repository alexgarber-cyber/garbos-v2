"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import {
  LIFECYCLE_STATUSES,
  PageHeader,
  StatusBadge,
  btnSecondary,
  inputClass,
} from "@/components/ui";

type Company = components["schemas"]["CompanyResponse"];

export default function CompaniesPage() {
  const [filters, setFilters] = useState({
    name: "",
    domain: "",
    industry: "",
    lifecycle_status: "",
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const query: Record<string, string> = {};
    if (filters.name) query.name = filters.name;
    if (filters.domain) query.domain = filters.domain;
    if (filters.industry) query.industry = filters.industry;
    if (filters.lifecycle_status) query.lifecycle_status = filters.lifecycle_status;
    const { data } = await api.GET("/companies", { params: { query } });
    setCompanies(data ?? []);
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
      <PageHeader
        title="Companies"
        action={{ href: "/companies/new", label: "+ New" }}
        secondaryAction={{ href: "/import", label: "Import" }}
      />

      <form onSubmit={onSearch} className="mb-5 flex flex-wrap gap-2">
        <input
          placeholder="Name"
          className={inputClass}
          value={filters.name}
          onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          placeholder="Domain"
          className={inputClass}
          value={filters.domain}
          onChange={(e) => setFilters((f) => ({ ...f, domain: e.target.value }))}
        />
        <input
          placeholder="Industry"
          className={inputClass}
          value={filters.industry}
          onChange={(e) => setFilters((f) => ({ ...f, industry: e.target.value }))}
        />
        <select
          className={inputClass}
          value={filters.lifecycle_status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, lifecycle_status: e.target.value }))
          }
        >
          <option value="">All statuses</option>
          {LIFECYCLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
              <th className="px-4 py-2 font-medium">Domain</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Employees</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  Loading…
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No companies found.
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                >
                  <td className="px-4 py-2">
                    <Link href={`/companies/${c.id}`} className="block font-medium text-[var(--color-accent)]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={c.lifecycle_status} />
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{c.domain ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{c.industry ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {c.employee_count ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
