"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { DealKanban } from "@/components/DealKanban";
import {
  PageHeader,
  StalenessIndicator,
  StatusBadge,
  btnSecondary,
  inputClass,
} from "@/components/ui";

type Deal = components["schemas"]["DealResponse"];
type PipelineStage = components["schemas"]["PipelineStageResponse"];

type View = "list" | "kanban";

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stageFilter, setStageFilter] = useState("");
  const [view, setView] = useState<View>("list");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query: Record<string, number> = {};
    if (stageFilter) query.pipeline_stage_id = Number(stageFilter);
    const { data } = await api.GET("/deals", { params: { query } });
    setDeals(data ?? []);
    setLoading(false);
  }, [stageFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.GET("/pipeline-stages").then(({ data }) => {
      if (data) setStages(data);
    });
  }, []);

  return (
    <div className="max-w-6xl">
      <PageHeader title="Deals" action={{ href: "/deals/new", label: "+ New" }} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          {(["list", "kanban"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                view === v
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {view === "list" && (
          <select
            className={inputClass}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <Link href="/settings/pipeline" className={btnSecondary}>
          Manage pipeline
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--color-muted)]">Loading…</p>
      ) : view === "kanban" ? (
        <DealKanban deals={deals} stages={stages} onMoved={load} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-base)] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Close date</th>
                <th className="px-4 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--color-muted)]">
                    No deals found.
                  </td>
                </tr>
              ) : (
                deals.map((d) => (
                  <tr
                    key={d.id}
                    className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/deals/${d.id}`}
                        className="font-medium text-[var(--color-accent)]"
                      >
                        {d.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {d.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={d.pipeline_stage_name} />
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {formatAmount(d.amount)}
                    </td>
                    <td className="px-4 py-2 text-[var(--color-muted)]">
                      {d.expected_close_date ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <StalenessIndicator days={d.days_since_last_activity} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
