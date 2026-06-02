"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { PageHeader, StatusBadge, inputClass } from "@/components/ui";

type Chain = components["schemas"]["ChainResponse"];

const STATUSES = ["active", "completed", "cancelled"] as const;

export default function ChainsPage() {
  const [status, setStatus] = useState("active");
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const query: Record<string, string> = {};
    if (status) query.status = status;
    const { data } = await api.GET("/chains", { params: { query } });
    setChains(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Chains" action={{ href: "/chains/new", label: "+ New" }} />

      <div className="mb-5 flex flex-wrap gap-2">
        <select
          className={inputClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Steps</th>
              <th className="px-4 py-2 font-medium">Linked to</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  Loading…
                </td>
              </tr>
            ) : chains.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No chains found.
                </td>
              </tr>
            ) : (
              chains.map((c) => {
                const done = c.steps.filter((s) => s.completed).length;
                return (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/chains/${c.id}`}
                        className="block font-medium text-[var(--color-accent)]"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {done}/{c.steps.length}
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {c.contact_name ?? c.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
