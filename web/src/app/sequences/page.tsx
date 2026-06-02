"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { PageHeader, StatusBadge, inputClass } from "@/components/ui";

type Sequence = components["schemas"]["SequenceResponse"];

const STATUSES = ["active", "inactive"] as const;

export default function SequencesPage() {
  const [status, setStatus] = useState("active");
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const query: Record<string, string> = {};
    if (status) query.status = status;
    const { data } = await api.GET("/sequences", { params: { query } });
    setSequences(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Sequences" action={{ href: "/sequences/new", label: "+ New" }} />

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
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Steps</th>
              <th className="px-4 py-2 font-medium">Active enrollments</th>
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
            ) : sequences.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--color-muted)]">
                  No sequences found.
                </td>
              </tr>
            ) : (
              sequences.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/sequences/${s.id}`}
                      className="block font-medium text-[var(--color-accent)]"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{s.steps.length}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    {s.active_enrollment_count}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={s.status} />
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
